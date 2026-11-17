import math, json

CFG = dict(
    psh_default=4.2, pr_quick=0.78,
    f_day={"siang_dominan":0.60,"campuran":0.45,"malam_dominan":0.30}, k_sc=1.0,
    days_per_month=365/12,
    setback=0.30, gap=0.02, alpha_min=25.0, rail_kgm2=3.0,
    shade_loss={0:0.0,1:0.03,2:0.08,3:0.15},
    t_cell_avg=50.0, soiling=0.03, mismatch=0.02, dc_wire_default=0.015, ac_wire_default=0.005,
    availability=0.01, other=0.02,
    dcac_min=1.0, dcac_max=1.35, dcac_pref=1.2,
    t_min_default=10.0, t_cell_max_default=70.0, voc_margin=0.0,
    k_isc_cable=1.25, rho20=0.0175, alpha_cu=0.00393, t_cond=70.0,
    dc_dv_pass=1.5, dc_dv_fail=3.0, ac_dv_pass=2.0, ac_dv_fail=3.0,
    dc_cable_series=[4,6,10], dc_ampacity={4:55,6:70,10:98}, dc_derate=0.8,
    ac_cable_series=[2.5,4,6,10,16,25], ac_ampacity={2.5:21,4:28,6:36,10:50,16:68,25:89}, ac_derate=0.87,
    mcb_series=[6,10,16,20,25,32,40,50,63], k_mcb=1.25,
    deg1=0.01, deg=0.004, om_pct=0.01, discount=0.08, horizon=25, esc=0.0,
    pr_mode='detail', eff_default=0.975, dcac_warn_lo=0.8, dcac_warn_hi=1.5,
    inv_repl_year=12, inv_repl_pct_of_inv_price=1.0,
)
ORIENT = { # tilt bin -> direction -> factor
 "0-10":{"U":1.00,"T":0.98,"S":0.98,"B":0.98},
 "11-20":{"U":1.00,"T":0.96,"S":0.95,"B":0.96},
 "21-30":{"U":0.99,"T":0.93,"S":0.89,"B":0.93},
 "31-45":{"U":0.96,"T":0.88,"S":0.80,"B":0.88},
 "46-60":{"U":0.90,"T":0.80,"S":0.68,"B":0.80},
}
def tilt_bin(t):
    if t<=10: return "0-10"
    if t<=20: return "11-20"
    if t<=30: return "21-30"
    if t<=45: return "31-45"
    return "46-60"
def dir_group(az, lat=-7.0):
    az%=360
    g = "U" if (az>=315 or az<45) else "T" if az<135 else "S" if az<225 else "B"
    if lat>0 and g in("U","S"): g = "S" if g=="U" else "U"
    return g
def f_orient(az,tilt,lat=-7.0): return ORIENT[tilt_bin(tilt)][dir_group(az,lat)]

MOD = dict(wp=575,voc=52.0,vmp=43.5,isc=13.9,imp=13.22,b_voc=-0.25,g_pmax=-0.30,L=2.278,W=1.134,kg=28.0,fuse=25)
INVS = [
 dict(id="I1K5",ph=1,pac=1500,vdcmax=500,vmin=60,vmax=450,vstart=80,nm=1,spm=1,impp=16,iscmax=20,iac=6.8,eff=0.965,price=5.0e6),
 dict(id="I2K",ph=1,pac=2000,vdcmax=500,vmin=60,vmax=450,vstart=80,nm=1,spm=2,impp=16,iscmax=20,iac=9.1,eff=0.97,price=6.0e6),
 dict(id="I3K",ph=1,pac=3000,vdcmax=550,vmin=70,vmax=500,vstart=80,nm=2,spm=1,impp=16,iscmax=20,iac=13.6,eff=0.975,price=7.5e6),
 dict(id="I4K",ph=1,pac=4000,vdcmax=600,vmin=80,vmax=550,vstart=90,nm=2,spm=1,impp=16,iscmax=20,iac=18.2,eff=0.975,price=9.0e6),
 dict(id="I5K",ph=1,pac=5000,vdcmax=600,vmin=80,vmax=550,vstart=90,nm=2,spm=1,impp=16,iscmax=20,iac=22.7,eff=0.976,price=10.5e6),
 dict(id="I6K",ph=1,pac=6000,vdcmax=600,vmin=80,vmax=550,vstart=90,nm=2,spm=2,impp=16,iscmax=20,iac=27.3,eff=0.977,price=12.0e6),
 dict(id="I5K3P",ph=3,pac=5000,vdcmax=1000,vmin=160,vmax=850,vstart=180,nm=2,spm=1,impp=16,iscmax=20,iac=7.6,eff=0.978,price=17e6),
 dict(id="I6K3P",ph=3,pac=6000,vdcmax=1000,vmin=160,vmax=850,vstart=180,nm=2,spm=1,impp=16,iscmax=20,iac=9.1,eff=0.979,price=19e6),
 dict(id="I10K3P",ph=3,pac=10000,vdcmax=1000,vmin=160,vmax=850,vstart=180,nm=2,spm=2,impp=16,iscmax=20,iac=15.2,eff=0.98,price=25e6),
]
def rho(T=None, c=CFG):
    T = c["t_cond"] if T is None else T
    return c["rho20"]*(1+c["alpha_cu"]*(T-20))

def layout_cap(seg, mod=MOD, c=CFG):
    if seg.get("struktur")=="tidak_layak": return 0, None
    L,W = seg["L"],seg["W"]
    Lu,Wu = L-2*c["setback"], W-2*c["setback"]
    if Lu<=0 or Wu<=0: return 0,None
    g=c["gap"]; best=(0,None)
    for ori in ("portrait","landscape"):
        # portrait: long side along slope (W dir) ; landscape: long side along ridge (L dir)
        along_ridge = mod["W"] if ori=="portrait" else mod["L"]
        along_slope = mod["L"] if ori=="portrait" else mod["W"]
        ncol = math.floor((Lu+g)/(along_ridge+g))
        if seg["jenis"]=="dak_beton":
            b=math.radians(seg.get("tilt_pasang",10))
            h=along_slope*math.cos(b)
            pitch = h + along_slope*math.sin(b)/math.tan(math.radians(c["alpha_min"]))
            nrow = 0 if Wu<h else math.floor((Wu-h)/pitch)+1
        else:
            nrow = math.floor((Wu+g)/(along_slope+g))
        n=max(0,ncol)*max(0,nrow)
        if n>best[0]: best=(n,ori)
    return best

def seg_yield(seg, psh, pr, lat=-7.0, c=CFG):
    tilt = seg.get("tilt_pasang",10) if seg["jenis"]=="dak_beton" else seg["tilt"]
    fo = f_orient(seg["az"], tilt, lat)
    sh = c["shade_loss"][seg["shade"]]
    return psh*fo*(1-sh)*pr, fo, sh

def pr_detailed(mod, inv_eff, dc_loss=None, ac_loss=None, c=CFG):
    temp = abs(mod["g_pmax"])/100*(c["t_cell_avg"]-25)
    f = (1-temp)*(1-c["soiling"])*(1-c["mismatch"])*(1-(c["dc_wire_default"] if dc_loss is None else dc_loss))\
        *inv_eff*(1-(c["ac_wire_default"] if ac_loss is None else ac_loss))*(1-c["availability"])*(1-c["other"])
    return f

def string_limits(mod, inv, tmin, tcell, c=CFG):
    voc_cold = mod["voc"]*(1+mod["b_voc"]/100*(tmin-25))
    voc_hot = mod["voc"]*(1+mod["b_voc"]/100*(tcell-25))
    vmp_hot = mod["vmp"]*(1+mod["g_pmax"]/100*(tcell-25))
    vmp_cold = mod["vmp"]*(1+mod["g_pmax"]/100*(tmin-25))
    ns_max = math.floor(inv["vdcmax"]*(1-c["voc_margin"])/voc_cold)
    ns_min = max(math.ceil(inv["vmin"]/vmp_hot), math.ceil(inv["vstart"]/voc_hot))
    ns_mppt_max = math.floor(inv["vmax"]/vmp_cold)
    return dict(voc_cold=voc_cold,voc_hot=voc_hot,vmp_hot=vmp_hot,vmp_cold=vmp_cold,ns_max=ns_max,ns_min=ns_min,ns_mppt_max=ns_mppt_max)

def best_string(n, lim, inv, mod):
    best=None
    nsmax=min(lim["ns_max"],lim["ns_mppt_max"] if lim["ns_mppt_max"]>=lim["ns_min"] else lim["ns_max"])
    for ns in range(lim["ns_min"], lim["ns_max"]+1):
        for npar in range(1, inv["spm"]+1):
            used=ns*npar
            if used>n: continue
            # current checks
            if mod["isc"]*npar>inv["iscmax"]: continue
            key=(used, ns)
            if best is None or key>best[0]: best=(key,ns,npar)
    return None if best is None else dict(ns=best[1],npar=best[2],used=best[0][0])


import itertools
def assign(allocs, inv, lim, mod=MOD):
    """allocs: list of (seg, n). Each segment may use k MPPT (equal split). Returns best combo."""
    options=[]
    for seg,n in allocs:
        opts=[]
        for k in range(1, inv["nm"]+1):
            nk=n//k
            if nk<lim["ns_min"]: continue
            bs=best_string(nk,lim,inv,mod)
            if bs is None: continue
            opts.append(dict(seg=seg,k=k,ns=bs["ns"],npar=bs["npar"],used=k*bs["used"]))
        opts.append(dict(seg=seg,k=0,ns=0,npar=0,used=0))
        options.append(opts)
    best=None
    for combo in itertools.product(*options):
        if sum(o["k"] for o in combo)>inv["nm"]: continue
        key=(sum(o["used"] for o in combo), -sum(o["k"] for o in combo))
        if best is None or key>best[0]: best=(key,combo)
    if best is None or best[0][0]==0: return None
    return best[1]

def dcac_class(r,c=CFG):
    if c["dcac_min"]<=r<=c["dcac_max"]: return "PASS"
    if c["dcac_warn_lo"]<=r<c["dcac_min"] or c["dcac_max"]<r<=c["dcac_warn_hi"]: return "WARN"
    return "BLOCKER"

def run(case, c=CFG):
    out={}
    kwh=case["kwh"]; e_month=sum(kwh)/len(kwh); e_day=e_month/c["days_per_month"]
    fday=case["f_day"] if isinstance(case["f_day"],float) else c["f_day"][case["f_day"]]
    e_day_load=e_day*fday*c["k_sc"]
    mode=case.get("sizing_mode","cap_siang")
    e_target=e_day*case.get("offset",1.0) if mode=="penuh" else min(e_day*case.get("offset",1.0),e_day_load)
    psh=case.get("psh",c["psh_default"]); lat=case.get("lat",-7.0)
    pr_s = c["pr_quick"] if c["pr_mode"]=="quick" else pr_detailed(MOD,c["eff_default"])
    out.update(e_month=e_month,e_day=e_day,fday=fday,e_day_load=e_day_load,e_target=e_target,pr_sizing=pr_s)
    segs=case["segs"]
    for s in segs:
        s["cap"],s["ori"]=layout_cap(s)
        s["y"],s["fo"],s["sh"]=seg_yield(s,psh,pr_s,lat)
    out["caps"]={s["name"]:(s["cap"],s["ori"],round(s["y"],4)) for s in segs}
    order=sorted([s for s in segs if s["cap"]>0], key=lambda s:-s["y"])
    if not order: out["status"]="BLOCKER_NO_CAPACITY"; return out
    wp=MOD["wp"]/1000; rem=e_target; alloc={}
    for s in order:
        if rem<=0: alloc[s["name"]]=0; continue
        per=wp*s["y"]; n_lo=math.floor(rem/per); n_hi=n_lo+1
        n=n_lo if abs(n_lo*per-rem)<=abs(n_hi*per-rem) else n_hi
        n=min(n,s["cap"]); alloc[s["name"]]=n; rem-=n*per
    out["alloc_pre"]=dict(alloc)
    tmin=case.get("tmin",c["t_min_default"]); tcell=case.get("tcell",c["t_cell_max_default"])
    act=[(s,alloc[s["name"]]) for s in order if alloc[s["name"]]>0]
    cands=[]
    for inv in INVS:
        if case["fasa"]==1 and inv["ph"]!=1: continue
        if case["fasa"]==3 and inv["ph"]==1 and inv["pac"]>5000: continue
        lim=string_limits(MOD,inv,tmin,tcell)
        combo=assign(act,inv,lim)
        if combo is None: continue
        n_used=sum(o["used"] for o in combo); kwp=n_used*wp; r=kwp/(inv["pac"]/1000)
        cl=dcac_class(r)
        if cl=="BLOCKER": continue
        warn_phase = (case["fasa"]==3 and inv["ph"]==1)
        cands.append((inv,lim,combo,n_used,kwp,r,cl,warn_phase))
    if case["fasa"]==3 and any(x[0]["ph"]==3 for x in cands):
        cands=[x for x in cands if x[0]["ph"]==3]
    out["inv_candidates"]=[(x[0]["id"],round(x[5],3),x[6],x[3]) for x in cands]
    if not cands: out["status"]="BLOCKER_NO_INVERTER"; return out
    pri={"PASS":0,"WARN":1}
    inv,lim,combo,n_used,kwp,dcac,cl,wph=sorted(cands,key=lambda x:(pri[x[6]],x[7],x[0]["price"],abs(x[5]-c["dcac_pref"])))[0]
    out.update(inv=inv["id"],n_panel=n_used,kwp=kwp,dcac=dcac,dcac_class=cl,phase_warn=wph,
               strings=[(o["seg"]["name"],o["k"],o["ns"],o["npar"],o["used"]) for o in combo],skipped=[o["seg"]["name"] for o in combo if o["used"]==0],lim={k:round(v,3) for k,v in lim.items()})
    isc=MOD["isc"]; imp=MOD["imp"]; I_dc_design=c["k_isc_cable"]*isc
    ldc=case["l_dc"]; lac=case["l_ac"]
    def pick_cable(series,amp,derate,I):
        for a in series:
            if amp[a]*derate>=I: return a
    V=230 if inv["ph"]==1 else 400; k=2 if inv["ph"]==1 else math.sqrt(3)
    combo=[o for o in combo if o["used"]>0]
    def dv_dc_of(a): return max((2*ldc*imp*rho()/a)/(o["ns"]*MOD["vmp"])*100 for o in combo)
    a_dc=None
    for a in c["dc_cable_series"]:
        if c["dc_ampacity"][a]*c["dc_derate"]>=I_dc_design and dv_dc_of(a)<=c["dc_dv_pass"]: a_dc=a;break
    if a_dc is None: a_dc=c["dc_cable_series"][-1]
    dv_dc=dv_dc_of(a_dc)
    I_ac=inv["iac"]; mcb=next(m for m in c["mcb_series"] if m>=c["k_mcb"]*I_ac)
    def dv_ac_of(a): return (k*lac*I_ac*rho()/a)/V*100
    a_ac=None
    for a in c["ac_cable_series"]:
        if c["ac_ampacity"][a]*c["ac_derate"]>=mcb and dv_ac_of(a)<=c["ac_dv_pass"]: a_ac=a;break
    if a_ac is None: a_ac=c["ac_cable_series"][-1]
    dv_ac=dv_ac_of(a_ac)
    voc_cold_str=max(o["ns"] for o in combo)*lim["voc_cold"]
    spd_uc=1.2*voc_cold_str
    npar_max=max(o["npar"] for o in combo)
    ocpd_dc = (npar_max-1)*isc>MOD["fuse"]
    out.update(a_dc=a_dc,dv_dc=round(dv_dc,3),a_ac=a_ac,dv_ac=round(dv_ac,3),mcb=mcb,i_ac=I_ac,i_dc_design=round(I_dc_design,3),
               voc_cold_string=round(voc_cold_str,2),spd_uc_min=round(spd_uc,1),ocpd_string=ocpd_dc,
               dc_switch_i_min=round(c["k_isc_cable"]*isc*npar_max,2))
    prd=pr_detailed(MOD,inv["eff"],dv_dc/100,dv_ac/100); out["pr_final"]=prd
    e_pv_day=0; per_seg={}
    for o in combo:
        s=o["seg"]; y=psh*s["fo"]*(1-s["sh"])*prd; e=o["used"]*wp*y; per_seg[s["name"]]=round(e,3); e_pv_day+=e
    out["e_pv_day_by_seg"]=per_seg; out["e_pv_day"]=e_pv_day
    e_self_day=min(e_pv_day,e_day_load)
    out.update(e_self_day=e_self_day,sc=e_self_day/e_pv_day,sf=e_self_day/e_day,e_pv_year0=e_pv_day*365)
    tarif=case["tarif"]; ppj=case.get("ppj",0.0)
    rm=40*(case["daya"]/1000)*tarif if case["meter"]=="pascabayar" else 0
    capex=case["capex_kwp"]*kwp; out["capex"]=capex; out["rm"]=rm
    def bill(e,tar): 
        b=e*tar*(1+ppj); return max(rm*(1+ppj),b) if rm else b
    cash=[-capex]; sav=[]; prods=[]
    for y in range(1,c["horizon"]+1):
        e_y=out["e_pv_year0"]*(1-c["deg1"])*(1-c["deg"])**(y-1); d=e_y/365
        self_y=min(d,e_day_load)
        tar=tarif*(1+c["esc"])**(y-1)
        s_y=(bill(e_month,tar)-bill(max(e_month-self_y*c["days_per_month"],0),tar))*12
        opex=c["om_pct"]*capex; repl=inv["price"]*c["inv_repl_pct_of_inv_price"] if y==c["inv_repl_year"] else 0
        cash.append(s_y-opex-repl); sav.append(s_y); prods.append(e_y)
    r=c["discount"]; out["savings_y1"]=sav[0]; out["payback_simple"]=capex/sav[0]
    npv=lambda rr: sum(cf/(1+rr)**i for i,cf in enumerate(cash))
    out["npv"]=npv(r)
    lo,hi=-0.9,1.0
    if npv(lo)*npv(hi)<0:
        for _ in range(200):
            mid=(lo+hi)/2
            if npv(lo)*npv(mid)<=0: hi=mid
            else: lo=mid
        out["irr"]=(lo+hi)/2
    cum=0; dp=None
    for i,cf in enumerate(cash):
        cum+=cf/(1+r)**i
        if cum>=0 and dp is None: dp=i
    out["disc_payback_year"]=dp
    pv_cost=capex+sum((c["om_pct"]*capex)/(1+r)**y for y in range(1,c["horizon"]+1))+inv["price"]*c["inv_repl_pct_of_inv_price"]/(1+r)**c["inv_repl_year"]
    pv_e=sum(prods[y-1]/(1+r)**y for y in range(1,c["horizon"]+1))
    out["lcoe"]=pv_cost/pv_e
    return out

if __name__=="__main__":
    import json,copy
    def show(k,o,keys=None):
        print("==",k)
        for kk,vv in o.items():
            if keys is None or kk in keys: print("  ",kk,vv)
    seg=lambda **k: dict(shade=0,struktur="baik",**k)
    tc1=dict(kwh=[450]*12,f_day="campuran",fasa=1,daya=5500,tarif=1699.53,meter="pascabayar",l_dc=15,l_ac=10,capex_kwp=14e6,
        segs=[seg(name="A",L=8.0,W=5.0,jenis="genteng_tanah_liat",az=0,tilt=20)])
    show("TC01",run(tc1))
    tc2=dict(kwh=[1200]*12,f_day="siang_dominan",fasa=1,daya=7700,tarif=1699.53,meter="pascabayar",l_dc=20,l_ac=15,capex_kwp=13e6,
        segs=[seg(name="A",L=6.0,W=4.0,jenis="genteng_beton",az=0,tilt=20),
              dict(name="B",L=8.0,W=5.0,jenis="metal_spandek",az=90,tilt=20,shade=1,struktur="baik")])
    show("TC02",run(tc2))
    tc3=dict(kwh=[1200]*12,f_day="siang_dominan",fasa=3,daya=13200,tarif=1699.53,meter="pascabayar",l_dc=20,l_ac=15,capex_kwp=13e6,
        segs=[seg(name="A",L=10.0,W=6.0,jenis="genteng_beton",az=0,tilt=20)])
    show("TC03",run(tc3))
    inv=[i for i in INVS if i["id"]=="I4K"][0]
    for tmin in (10,0,-5): print("TC04 tmin",tmin,{k:round(v,3) for k,v in string_limits(MOD,inv,tmin,70).items()})
    d=dict(name="D",L=10.0,W=6.0,jenis="dak_beton",az=0,tilt=0,tilt_pasang=10,shade=0,struktur="baik")
    print("TC05 dak cap", layout_cap(d))
    print("TC05 genteng cap",layout_cap(seg(name="G",L=8.0,W=5.0,jenis="genteng_tanah_liat",az=0,tilt=20)))
    print("TC05 tidak layak cap",layout_cap(dict(name="G",L=8.0,W=5.0,jenis="genteng_tanah_liat",az=0,tilt=20,shade=0,struktur="tidak_layak")))
    tc6=copy.deepcopy(tc1); tc6["sizing_mode"]="penuh"
    show("TC06_penuh",run(tc6),["n_panel","kwp","dcac","inv","e_pv_day","e_self_day","sc","sf","capex","savings_y1","payback_simple","npv","irr","disc_payback_year","lcoe"])
    tc7=copy.deepcopy(tc1); tc7["segs"][0]["struktur"]="tidak_layak"
    show("TC07_blocker",run(tc7))
    print("orient", f_orient(0,20), f_orient(90,20), f_orient(180,20), f_orient(270,35), f_orient(180,35), f_orient(0,20,lat=1.0))
    print("pr detail default", pr_detailed(MOD,0.975), "rho70",rho())
