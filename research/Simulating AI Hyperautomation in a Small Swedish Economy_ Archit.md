# Simulating AI Hyperautomation in a Small Swedish Economy: Architecture, Mechanisms, Parameters and Visualisation 

The best design is a hybrid: a monthly-step agent-based model that is stockflow consistent and has a bank, with each firm's production modelled as a set of tasks. It should be calibrated to Swedish 2025–2026 data, and it should treat realised AI efficiency, demand elasticity and the creation of new tasks as the main parameters users control. A model without those three mostly just turns a "layoffs" dial; a model with them can show both the Ford paradox and the cases where it does not happen. 

## TL;DR 

Architecture: keep the individual agents (≈600 people, 24 firms), but build the money accounting on an agent-based stock-flow-consistent (AB-SFC) core, as in Caiani et al.'s benchmark and the Keynes+Schumpeter family. Add a bank that creates deposits when it lends, a production function made of tasks (Acemoglu–Restrepo), and a check every tick that the accounting balances. Dosi et al. (2022, Research Policy) is the closest published template. It is a multi-sector agent-based model in which automation, consumption that saturates in stages, and new sectors decide whether technological unemployment persists. The authors also find that "a fair distribution of income guarantees the lack of technological unemployment". <u>sciencedirect</u> 

- Calibration reality check: measured AI gains today are much smaller than the "hyperautomation" story. Danish workers report average time savings of 2.8% with "precise zeros" for earnings and hours. Acemoglu estimates ≤0.66% TFP over 10 years, ssrn and Penn Wharton estimates +1.5% GDP by 

2035. At the task level the gains are large (+14% in customer support, 34% for novices), nber but experienced developers were 19% slower in METR's trial. The rollout levels in the simulation should therefore be labelled scenarios, starting from an empirically grounded baseline. Sweden is an early adopter: 35.0% of firms used AI in 2025, against an EU average of 19.95%. alicelabs 

The biggest credibility upgrades, in order: 

1. Sector-specific demand elasticity and saturation. 

2. Reinstatement through new tasks and sectors. 

3. MPCs that depend on liquid assets. 

4. Adjustment mainly through a hiring freeze for entry-level workers rather than mass firing (the "Canaries" evidence). 

5. Adoption S-curves with a gap between nominal and realised gains. 

6. Endogenous credit and a Riksbank reaction rule. 

7. Concentrated ownership of firms. 

8. Swedish safety-net rules: the October 2025 a-kassa, and försörjningsstöd at the 2026 riksnorm. 

## Key Findings 

### Part 1 — Which modelling approach, and why 

|Approach|What it does well|Weakness for this<br>project|Verdict|
|---|---|---|---|
|Task-based|Breaks the effects|Equilibrium and|Use as the|
|(Acemoglu &|into displacement,|representative-agent.|firm's|
|Restrepo;|productivity and|No unemployment|production|
|Acemoglu|reinstatement. Links|dynamics, no|moduleand to|
|2024)|exposure × cost|individuals, no|calibrate how|
||savings to TFP via|demand shortfalls.|big the shock|
||Hulten's theorem||is.|



|Approach|What it does well|Weakness for this<br>project|Verdict|
|---|---|---|---|
||(4.6% of tasks ×<br>14.4% cost savings≈<br>0.66% TFP).<br>note|||
||Accounting is<br>guaranteed to add|||
|Stock-flow<br>consistent<br>(Godley–<br>Lavoie)|up: everyflow comes<br>from somewhere and<br>goes somewhere.<br>Credit, money and<br>sector balances are<br>handled naturally.|Aggregate sectors<br>only, so you can't see<br>individuals.|Use as the<br>accounting<br>backbone.|
|AB-SFC /<br>macro-ABM<br>(K+S,<br>EURACE,<br>Caiani et al.<br>benchmark,<br>Mark-0,<br>Lagom,<br>JAMEL,<br>CATS)|Heterogeneous<br>agents,<br>disequilibrium,<br>emergent<br>unemployment,firm<br>bankruptcies, credit<br>cycles. K+S "robustly<br>reproduces a wide<br>ensemble" of stylised<br>facts.<br>sssup Mark-0<br>shows sharp tipping<br>points between full-<br>and high-<br>unemployment<br>regimes.|Many parameters, so<br>calibration is hard<br>and outcomes are<br>path-dependent and<br>need Monte Carlo<br>runs.|Core<br>architecture.<br>Your current<br>model is<br>already a<br>simplified<br>member of<br>this family.|
|CGE|Detailed sector<br>input–output links<br>and trade, and policy|Assumes market<br>clearing and usually<br>full employment, so<br>it can't produce the|Use only to<br>check sectoral<br>price effects;|



|Approach|What it does well|Weakness for this<br>project|Verdict|
|---|---|---|---|
||tools trusted by|underconsumption|not suitable as|
||ministries.|spiral by design.|the engine.|



The most relevant published model is Dosi, Pereira, Roventini & Virgillito (2022), "Technological paradigms, labour creation and destruction in a multi-sector agent-based model". It has new technological paradigms and sectors arriving endogenously, "hierarchical needs satisfaction and class-based consumption behaviour", and technological unemployment "mediated by product complexities, income elasticities and Keynesian feedback between process innovation and demand generation". sciencedirect That is the user's question almost word for word. Copy its structure: consumption that saturates in stages, plus new sectors that open up and absorb demand. 

### Part 2 — What the evidence says about the size of the shock 

- Task-level gains are large but uneven. 

   - Brynjolfsson, Li & Raymond inigomedina (QJE 2025): AI assistance raised resolutions per hour by about 14–15% on average, and by 34% for novice and low-skilled agents, with minimal gains for the most skilled. nber <u>repec</u> They note that if demand is inelastic, "the firm could field the same number of customer support issues with 12 percent fewer worker-hours." <u>u-tokyo</u> That sentence is exactly the layoff mechanism the simulation models. 

   - METR's randomised trial: 16 experienced open-source developers were 19% slower with early-2025 AI tools (confidence interval roughly +2% to +39% longer), while believing they were about 20% faster. ingenire METR's 2026 follow-up could not produce a reliable estimate, partly because developers would not work without AI. arxiv 

- Gains across whole occupations are small so far. Humlum & Vestergaard (Denmark, 25,000 workers, 7,000 workplaces) found average time savings of 

2.8%; workers whose employers "promote AI chatbots report time savings of approximately 7%" (BFI WP 2025-56 / NBER w33777). Effects on earnings and hours were "precise zeros", with confidence intervals ruling out effects above 1% (a later SSRN version rules out "effects larger than 2% two years after"), and pass-through to wages was weak. Denmark is the closest Nordic analogue to the model. 

Macro estimates are modest. 





   - Acemoglu: ≤0.66% TFP over 10 years (≈0.064% a year), and below 0.53% if hard-to-learn tasks are taken into account. The capital share rises by about 0.31 percentage points. mit <u>ssrn nber</u> 

   - Penn Wharton Budget Model: about 40% of GDP exposed; GDP level +1.5% by 2035, nearly +3% by 2055 and +3.7% by 2075; peak TFP growth contribution of 0.2 pp in 2032. github 

   - Goldman Sachs (Briggs & Kodnani, Global Economics Analyst, 26 March 2023) is at the optimistic, extrapolation-based end: "we estimate that AI could eventually increase annual global GDP by 7%", almost $7tn over a 10-year period, with "just under 1½ percentage points" a year of extra US labour-productivity growth. 

- Exposure. 

   - Eloundou et al. (Science 2024): about 80% of US workers have at least 10% of their tasks exposed, and about 19% have at least 50% exposed. Exposed here means LLMs could cut task time by at least 50% at equal quality. minerval That is technical feasibility, not adoption. chriswirz 

   - ILO Working Paper 140 (with Poland's NASK, May 2025): 25% of global employment is exposed (34% in high-income countries), and "3.3% of global employment falls into the highest exposure category, albeit with significant differences between female (4.7%) and male employment (2.4%)". Clerical work is the most exposed. In high-income countries the highest-risk jobs are 9.6% of female employment against 3.5% of male employment. 

- Adoption speed (Sweden). Eurostat reports that Swedish firms with 10+ employees using AI went from 10.4% (2023) to 25.1% (2024) to 35.0% (2025), against an EU average of 19.95%. Denmark had 42.0% and Finland 37.8%. europa <u>alicelabs web-directory</u> 

- Automation versus augmentation. Anthropic's Economic Index found augmentation at 52% and automation at 45% of Claude.ai conversations in November 2025, after automation briefly led 49–47 in August 2025. <u>anthropic</u> Directive automation was higher in API (business) traffic. sanity Over the longer run automation's share has crept up from 41% in January 2025. anthropic 

- Early labour-market signal. Brynjolfsson, Chandar & Chen ("Canaries in the Coal Mine?", ADP payroll data): 

   - Workers aged 22–25 in the most AI-exposed occupations saw a 13% relative fall in employment (data to July 2025), rising to 16% in the November 2025 revision. ai-first The August 2026 update extends the data to June 2026. stanford 

   - Adjustment happened "primarily through employment rather than compensation", in occupations where AI automates rather than augments, stanford and mostly through fewer junior hires rather than incumbents being fired. stanford 

   - The authors call these descriptive, not causal, findings. ai-first 

## Details 

### (a) Recommended architecture 

1. Time step and clock. Use a monthly tick, mapped to real dates from today (November 2026). Let users set a speed (months per second) and start the rollout at a chosen date. Monthly steps fit Swedish institutions: rent and mortgage payments, a-kassa payable monthly from October 2025, monthly försörjningsstöd checks, and Riksbank meetings about every six weeks. <u>stsakassa</u> 

#### 2. Agents. 

   - Persons: age, skill/education, occupation and task bundle, employer, wage, union and a-kassa membership with months of membership, liquid deposits, illiquid housing equity, debt, shareholdings, and a scar or skilldepreciation variable. 

   - Households: tenure, rent or mortgage, and an arrears counter. 

   - Firms: sector, task mix, AI adoption stage, capital, prices and markup, inventory, demand expectations, and loans. 

   - One bank, the government, the Riksbank, and the rest of the world (exports, imports, and foreign AI vendors). 

3. Production as tasks. Each firm's output needs a set of tasks. AI changes each task's labour requirement by a factor (1 − e·a), where e is the efficiency of the current rollout level and a is the task's automatability score. Labour demand is then derived as output demand ÷ effective labour productivity. A reinstatement channel adds new task types, or a new sector, at a configurable rate. This is the Acemoglu–Restrepo trio of displacement, productivity and reinstatement, made concrete. 

4. Accounting (the SFC backbone). Keep a balance-sheet matrix and a transaction-flow matrix. Loans create deposits, and repayments destroy them. After every tick, assert that (i) every flow has a payer and a receiver, (ii) total deposits equal the bank's deposit liabilities, and (iii) the sectoral net lending of households, firms, government, bank and rest of world sums to zero. Show a red warning in the UI if a check fails. 

5. Behavioural rules (the boundedly rational ones from the K+S and Caiani benchmarks). 

   - Firms forecast demand adaptively, set output, and hire or fire towards that target. 

   - Prices are set as a markup over unit cost, where the markup responds to market share and competition. 

   - The bank lends subject to a capital constraint. 

Households consume according to MPCs that depend on liquid assets and income. 

6. Ensembles. Every scenario button should run N seeds (for example 20) in a background Web Worker and show median and 10–90% bands. Agentbased model results are path-dependent, and a single run is anecdote. 

### (b) Mechanisms to add or improve, ranked by importance 

1. Price elasticity of demand by sector, with saturation. This is the single parameter that decides whether higher efficiency leads to layoffs or to more output. Brynjolfsson et al. make the point explicitly: with inelastic demand, 15% productivity means about 12% fewer hours. u-tokyo Give each sector an elasticity, with income-elastic and price-elastic sectors (software, leisure, hospitality) able to grow, and saturating ones (food, utilities) unable to. Use Dosi-style hierarchical needs, where households move up a needs ladder as income rises. 

2. Reinstatement, i.e. new tasks and new sectors. Without it, the model mechanically rules out the historical outcome. Add a slider for the "new task creation rate", plus optional entry of new firms in an "AI-complement" sector. Its jobs should demand retraining time and be biased towards higher skills. 

3. MPCs that depend on liquid assets. Fagereng, Holm & Natvik (Norwegian lottery data; Statistics Norway DP 852) report that "MPCs spike in the year of winning, with a mean estimate of 0.35", and the AEJ: Macro 2021 version adds that "Low-liquidity winners of the smallest prizes (around US$1,500) are estimated to spend all within the year of winning", against "slightly below one-half" for high-liquidity winners of large prizes. MPCs vary systematically only with liquid assets and the amount won. Implement MPC as a declining function of deposits relative to income. This is what turns income losses among the unemployed into a demand shortfall while profits flowing to wealthy owners leak into saving: the Kaleckian side of the Ford paradox. 

4. How firms shed labour. Adjustment should run mostly through attrition and a hiring freeze for entry-level and young workers before any firing ("Canaries"), with LIFO-style firing ("sist in, först ut", Swedish LAS) when 

firing does occur. Visually this changes the story from "mass firing" to "young people can't get in", which is what is actually observed. 

5. Adoption S-curve with a nominal versus realised gap. Firms adopt with logistic diffusion. Realised efficiency ramps up after a J-curve lag, and part of it is lost (METR, Humlum). Adoption should be faster in large firms and in IT, finance and professional services. Keep the configurable rollout levels, but let each level take effect through diffusion rather than instantly. 

6. Endogenous credit and monetary policy. The bank creates money when it lends. A Taylor-type Riksbank rule should start at 2.00%, the rate decided on 4 November 2026 and applying from 11 November. riksbank Mortgage rates are the policy rate plus a spread, mostly variable: the Riksbank's Financial Stability Report 2026:1 (29 May 2026) says "a large share of household loans are at variable rates – almost 80 per cent. This is the highest level since Statistics Sweden began measuring households' interest-rate fixation periods." This lets a deflationary demand shock trigger rate cuts that cushion indebted households, an important Swedish-specific channel. 

7. Ownership concentration and profit distribution. Dividends should go to a small, wealthy, low-MPC shareholder group, and partly abroad. Report the Kalecki profit identity (profits = investment + capitalist consumption + government deficit + net exports − worker saving) as a live chart, so users can see why margins rise while sales fall. 

8. Wage bargaining and pass-through. Swedish wages follow sector-wide collective agreements led by the export sector ("märket"). Model annual wage rounds that respond weakly to unemployment, and a configurable split of cost savings into price cuts, markup and wages. Humlum & Vestergaard find weak wage pass-through of time savings so far, andershumlum and Acemoglu projects that the capital share rises. nber 

9. Firm entry and exit and competition. Bankruptcy when equity is negative, and new firms entering when margins are high. Entry is what forces cost savings into prices over time. Without it, a markup-capture scenario never self-corrects. 

10. Retraining and scarring. Displaced workers carry an earnings penalty and skill decay that rises with time out of work. Swedish evidence: 

   - Eliason & Storrie (JOLE 2006): workers displaced by plant closures in 1987 still had worse outcomes in 1999, about 7–8% lower annual earnings roughly a decade on. The long-run losses were driven by greater sensitivity to later recessions. wiley <u>google</u> 

   - Seim (2019): roughly 16% lower earnings seven years after displacement. <u>wiley</u> 

   - Military base closures: about 5% lower in later years. doi 

   - Ohlsson & Storrie: targeted programmes for the Uddevalla shipyard and LKAB mine workers produced positive long-run effects. ssrn Use this to justify a retraining-policy lever. 

11. Endogenous house prices. Foreclosures and lower income should push prices down, which raises loan-to-value ratios and creates negative equity that limits mobility. 

12. Fiscal rule options. Offer a choice between automatic stabilisers (let the deficit widen) and austerity, so users can see that austerity amplifies the demand spiral. 

13. Policy levers (see the modelling results below): automation tax, UBI or citizen dividend funded by a sovereign fund holding AI-firm equity, shorter working week, and retraining. 

### (c) Suggested parameter values (Sweden-specific where possible) 

|Parameter|Suggested value|Source / note|
|---|---|---|
|||Riksbank, decision of|
|Policy rate (start)|2.00% from 11 Nov 2026 (raised<br>from 1.75%)<br>riksbank|4 Nov 2026 (previous<br>1.75%); next decision|
|||16 Dec 2026|
|Mortgage rate|Policy rate + ~1.5–2 pp; ~80%<br>variable|Riksbank FSR 2026:1<br>(variable share). FI|



|Parameter|Suggested value|Source / note<br>found the new-<br>mortgage rate<br>averaged ~4% in 2024<br>when the policy rate<br>was higher<br>riksbank<br>f|
|---|---|---|
|Household debt /<br>disposable income|~175% (down from ~200% in<br>2021)<br>riksbank|Riksbank FSR 2025:2|
||Max LTV 90% for new loans (80%<br>on extensions) from 1 Apr 2026.||
|Mortgage cap /<br>amortisation|Amortise 1%/yr above 50% LTV,<br>2%/yr above 70%. Extra<br>amortisation above 4.5× income<br>abolished<br>financesweden<br>xn--<br>bramklare-y2a|Act 2026:226 via<br>Finance Sweden (Aug<br>2026); FI|
|New borrowers'<br>LTV|Average 64.5%; home buyers 69%<br>(2024)<br>f|FI,The Swedish<br>Mortgage Market<br>2025|
|Tenure split<br>(households)|Owned houses 38%, rentedflats<br>29%, tenant-ownedflats<br>(bostadsrätt) 21%, other 12%<br>scb|SCB,Hushållens<br>boende 2025|
|Rent (hyresrätt),<br>2026|1 room 5,640 kr; 2 rooms 7,742<br>kr; 3 rooms 9,528 kr/month;<br>+3.3% vs 2025<br>scb|SCB,Hyror i<br>bostadslägenheter<br>2026|
|Housing cost share<br>of disposable<br>income|Renters 27%, bostadsrätt 21%,<br>house owners 18% (median,<br>2024)<br>scb|SCB|
|A-kassa|80% of prior income up to a<br>ceiling of 34,000 kr/month (max<br>27,200 kr gross), falling to 70%|Law in force 1 Oct<br>2025 (Unionens, IF|



|Parameter|Suggested value|Source / note|
|---|---|---|
||after 100 days and 65% after|Metall, Kommunals a-|
||200. Up to 300 days. 60% or 50%<br>if membership is 6–11 or <6<br>months. Eligibility: 120,000 kr<br>earned in the last 12 months and<br>≥11,000 kr in 4 of those months<br>akademikernasakassa<br>kommunalsakassa<br>arkitekt<br>unionensakassa|kassor)|
||Riksnorm 2026: 5,220 kr/month||
|Social assistance<br>(försörjningsstöd)|(single), 8,510 kr (couple), plus<br>reasonable housing cost, minus<br>all income; means-tested against<br>assets|Regeringen, Nov 2025|
||Average municipal + regional rate<br>32.38% (2026). State tax 20%||
|Income tax|above 643,000 kr taxable<br>(brytpunkt 660,400 kr gross for<br>under-66s)<br>ekonomifakta<br>skatteverket|SCB, Dec 2025;<br>Skatteverket|
|Public-sector<br>employment share|~29–30% (municipalities 17%,<br>state 6%, regions 6%)<br>statskontoret|Statskontoret (2024);<br>Ekonomifakta|
|Exports / GDP|~51–53% (2025), gross exports.<br>SCB's revised national accounts<br>give 57% for 2024; value added in<br>exports is ~30% of GDP<br>ekonomifakta<br>ekonomifakta<br>scb|Ekonomifakta; SCB.<br>Sources disagree, so<br>use ~52% gross with<br>~45% import content|
|Firm AI adoption|~35–45% offirms using some AI.|Eurostat 2025:|
|(start, Nov 2026)|Adoption≠deep integration|Sweden 35.04%|



|Parameter|Suggested value|Source / note<br>(2024: 25.09%)<br>web-<br>directory|
|---|---|---|
|MPC|Hand-to-mouth (low liquid<br>assets) 0.6–0.9; median 0.35;<br>wealthy owners 0.1–0.2|Fagereng, Holm &<br>Natvik 2021 (mean<br>0.35; low-liquidity<br>winners of the<br>smallest prizes spend<br>all within the year)|
|"Realistic" realised<br>efficiency, 2026–<br>27|3–7% labour time saved in<br>exposed tasks|Humlum &<br>Vestergaard (2.8%<br>average; ~7% with<br>employer push)|
|"Strong" level|15% in exposed tasks (up to 30–<br>35% for novices)|Brynjolfsson, Li &<br>Raymond|
|||Speculative<br>scenarios. Eloundou's|
|"Hyperautomation"<br>levels|30%→50%→70%|50% time-saving<br>threshold is technical<br>exposure, not realised<br>gains. Label them as<br>such|
||Baseline should produce +0.5–|Acemoglu 0.66% TFP;|
|Macro check|1.5% GDP level effect over ~10<br>years|jablevine PWBM<br>+1.5% by 2035|
||Roughly stable since the mid-|Ekonomifakta;|
|Wage share|1980s;<br>ekonomifakta let AI<br>scenarios shift it|Acemoglu (+0.31 pp<br>capital share)|
|Displacement scar|−15–30% earnings in year 1 (incl.<br>unemployment),−5–16% after 5–|Eliason & Storrie<br>2006; Seim 2019;|



|Parameter|Suggested value|Source / note|
|---|---|---|
||10 years|Dahlberg et al. 2024|



Sector automatability scores (0–1, relative). These are my synthesis of the ILO 2025 gradients (clerical highest, with rising exposure in media, software and finance), Eloundou et al. (higher-wage cognitive work more exposed) and PWBM. They are not quoted figures. 

|Sector|Score|
|---|---|
|Admin/back office,finance/insurance|0.60–0.70|
|IT/software, media|0.55–0.65|
|Professional services|0.45–0.55|
|Retail/customer service|0.35–0.45|
|Public administration|0.30–0.40|
|Manufacturing|0.20–0.30|
|Education|0.20–0.25|
|Health and social care|0.10–0.15|
|Construction, hospitality|0.05–0.15|



In the clerical-heavy sectors, weight the scores towards women, matching the ILO gender gap. 

#### Policy modelling results to encode. 

- Robot tax. Guerreiro, Rebelo & Teles (Review of Economic Studies 2022) find it optimal to tax robots only while the current generation of routine workers, who can no longer move to other occupations, are still working. The tax is modest (about 7%, then 3%, then 1% over three decades) and goes to zero 

once they retire. cepr <u>restud</u> This argues for a time-limited automation tax lever. 

- Income distribution. Dosi et al. (2022) find that the distribution of income, not technology alone, determines whether technological unemployment persists. sciencedirect 

- UBI. I found no verified quantitative result for UBI in an agent-based model. Treat UBI and citizen-dividend levers as exploratory. 

### (d) Visualisation recommendations 

1. The individuals view, as an overview to drill into. Show a grid or "town map" of 600 dots grouped by household and home. Colour encodes status: employed, entry-level searching, a-kassa (shading by the 80/70/65% steps), försörjningsstöd, arrears 1–3, evicted or foreclosed. Clicking a dot opens a biography panel with income, balance sheet, payment history and a timeline ("Anna, 24, junior accountant — never hired after 2027"). Pin 3–5 "story characters" that are always tracked: a junior clerk, a mid-career engineer, a care worker, a shareholder, a landlord. 

2. Linked aggregates. Small-multiple time series sharing one time cursor: unemployment, real wage bill, sales volume, markups and profits, prices, the Kalecki profit decomposition, government balance and debt, policy rate, house prices. Brushing a period highlights the affected dots. 

3. Money-flow Sankey per tick. Show flows households → firms → wages / dividends / AI-vendor imports / taxes. Show leakages (foreign AI spend, saving by low-MPC owners) as visibly widening exits. This view makes the Ford paradox intuitive. 

4. Company dashboard. One card per firm with a sparkline of headcount versus output, AI adoption stage, margin and a bankruptcy risk gauge. Order by sector automatability so that "affects companies more and more" shows as a wave moving across the cards. 

5. Scenario comparison. Always draw a "ghost" baseline with no AI, and give each rollout a shaded confidence band from the ensemble runs. Let users snapshot and overlay two policy settings. 

6. Rollout timeline editor. A Gantt-style strip where users drag level steps (e.g. 5% → 15% → 30% → 50%) to dates, with each level's diffusion curve drawn beneath. 

7. Accounting integrity badge. A small always-on "SFC ✓" indicator with an expandable flow matrix. This adds credibility for economists without cluttering the view for lay users. 

8. Tooling. For browser delivery, keep plain JS and Canvas/WebGL for the dots, put ensemble runs in Web Workers, and use D3 or Observable Plot for charts. Use Mesa (Python, with its Solara-based browser visualisation) or NetLogo for prototyping and batch calibration, then port the parameters. Follow explorable-explanation practice (Bret Victor; Nicky Case's Parable of the Polygons): one guided "story mode" that walks through the causal chain step by step before opening the full sandbox. 

### Validation and calibration 

- Stylised facts to reproduce first, with AI switched off. These are the facts the K+S family reproduces: GDP fluctuations, procyclical investment and consumption that is smoother than output, Okun's law, a Beveridge curve, right-skewed firm size distribution, and lumpy investment. 

- Match Swedish levels at t=0: unemployment, a public-sector share of about 30%, tenure shares, debt/income of about 175%, housing-cost shares and the export share. 

- Run the AI baseline against the macro benchmarks (Acemoglu, PWBM) and the micro benchmarks (Humlum, "Canaries" entry-level effects). 

- Do sensitivity sweeps over elasticity, reinstatement rate and pass-through, since these drive the result. Report which conclusions survive across seeds. 

## Recommendations 

1. First implement the three mechanisms that decide the outcome: demand elasticity and saturation per sector, reinstatement, and MPCs that depend on liquid assets. Then switch firm adjustment to hiring freeze first. Currently the 

conclusion that efficiency leads to layoffs and then to collapse is effectively hard-coded. 

2. Add a bank that creates money and a Riksbank rule starting at 2.00%, and enforce stock-flow checks every tick. 

3. Use the a-kassa rules in force since 1 October 2025 and the 2026 riksnorm exactly. The membership-dependent 80/60/50% levels and the 34,000 kr ceiling unionensakassa matter a great deal for how fast middle-income households fall into arrears. 

4. Ship three presets: "Measured 2025" (3–7%), "Strong adoption" (15%) and "Hyperautomation" (30–70%, flagged as speculative). Show the no-AI ghost and ensemble bands in every view. 

5. Add four policy levers: a time-limited automation tax, a citizen dividend from public AI equity, a shorter working week, and retraining with Uddevalla-style targeting. Present results as scenario comparisons, not forecasts. 

## Caveats 

- Evidence on measured AI effects is early and conflicting. The figures range from 2.8% (Danish surveys) to 14–34% (one firm's customer support) to −19% (expert developers). "Canaries" is descriptive, and its estimate has moved from 13% to 16%. ai-first 

- Exposure indices measure technical feasibility, not realised automation. The sector scores here are my synthesis, not official figures. 

- Some numbers vary between sources. Exports/GDP is 51–57% depending on the source and data vintage, and the 2025 debt ratio is 169–175%. <u>ekonomidata riksbank</u> I could not obtain FI's latest average loan-to-income figure or a current numeric Swedish wage share. 

- I found no robust direct estimate of how much of AI cost savings is passed through to prices versus kept as margins. Treat pass-through as a swept parameter (e.g. 20–80%), not a calibrated one. 

- Agent-based results are path-dependent. Always present ensembles, and frame the tool as a way to explore mechanisms rather than a forecast of 

Sweden. 

