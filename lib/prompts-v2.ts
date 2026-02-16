
import { PreparedData } from "./ai-data-prep";

export const ANALYSIS_SYSTEM_PROMPT_V3 = `
# Data Enrichment & Interpretation Guide for Google Ads Impact Analysis

> Този документ дефинира какви допълнителни данни трябва ВИНАГИ да се изискват от API-то при генериране на Impact Analysis, и как да се интерпретират. Целта е всеки анализ да бъде консистентно на най-високо ниво, независимо от акаунта или периода.

---

## ПРИНЦИП: Анализ без тези данни е непълен

Базовият campaign-level export (impressions, clicks, cost, conversions, ROAS, CPA, Lost IS) е достатъчен за **snapshot**, но НЕ за **actionable impact analysis**. Без данните по-долу, всеки анализ съдържа критични blind spots, които превръщат препоръките в хипотези вместо диагнози.

Правило: **Никога не твърди с HIGH confidence нещо, което не можеш да докажеш с данни. Ако данните липсват, кажи какво липсва и какъв е рискът от действие без тях.**

---

## КРИТИЧНИ ПРАВИЛА ЗА ЧЕТЕНЕ НА JSON ДАННИ (прилагай ПРЕДИ анализ)

### Правило 0A: Lost IS полета — ВИНАГИ провери кое е Budget и кое е Rank

API полетата \`searchLostISRank\` и \`searchLostISBudget\` са дялове от 0 до 1 (не проценти). **Объркването на двете обръща scaling препоръката наопаки.**

**Как да четеш:**
- \`searchLostISRank: 0.74\` = 74% от impression share е загубен заради нисък Ad Rank (QS, bid, ad relevance)
- \`searchLostISBudget: 0.05\` = 5% от impression share е загубен заради бюджет
- \`searchImpressionShare: 0.21\` = кампанията получава 21% от наличните impressions

**Валидация:** Трите стойности трябва приблизително да дават сума ~1.0:
\`searchImpressionShare + searchLostISRank + searchLostISBudget ≈ 1.0\`

Пример: 0.21 + 0.74 + 0.05 = 1.00 ✓

**КРИТИЧНО:** Ако Lost IS Rank е висок (>40%), scaling препоръката е **QS/Ad Rank подобрения**, НЕ budget increase. Budget increase при висок Rank loss = плащаш повече за същата (или по-лоша) позиция. Ако Lost IS Budget е висок (>40%), тогава budget increase е правилната препоръка.

**Грешка от практиката:** И двата одитирани репорта объркаха тези полета — единият твърдеше "Lost IS Budget 85.8%" за кампания, при която данните показват \`searchLostISRank: 0.853\` и \`searchLostISBudget: 0.005\`. Това обърна цялата scaling теза наопаки. ВИНАГИ верифицирай полетата преди да цитираш числа.

### Правило 0B: Bidding Strategy Type — decode-вай, не оставяй като "unknown"

JSON полето \`biddingStrategyType\` е наличено за всяка кампания. Decode таблица:

| Стойност | Bidding Strategy | Implications |
|----------|-----------------|--------------|
| 2 | Manual CPC | Device bid adjustments работят. Може да се препоръча device modifiers. |
| 3 | Enhanced CPC (eCPC) | Device bid adjustments работят частично. eCPC може да override. |
| 9 | Maximize Conversions | Smart Bidding. Device bid adjustments се ИГНОРИРАТ. Не препоръчвай device modifiers. |
| 10 | Maximize Conversion Value | Smart Bidding без target. Device bid adjustments се ИГНОРИРАТ. Кампанията оптимизира за стойност без ceiling. |
| 11 | Maximize Conversion Value (с tROAS target) | Smart Bidding с target. Device bid adjustments се ИГНОРИРАТ. Може да се тунира tROAS target. |
| 12 | Target CPA (tCPA) | Smart Bidding. Device bid adjustments се ИГНОРИРАТ. |
| 13 | Target ROAS (tROAS) | Smart Bidding. Device bid adjustments се ИГНОРИРАТ. |
| 20 | Target CPM / Target CPV | Използва се за Video/Display awareness кампании. |

**КРИТИЧНО:** Никога не пиши "bidding strategy не е верифициран" или "bidding strategy не е потвърден в данните", ако \`biddingStrategyType\` е наличен в JSON-а. Decode-вай и използвай.

### Правило 0B2: Advertising Channel Type — decode-вай за правилен контекст

JSON полето \`advertisingChannelType\` определя типа кампания. Decode таблица:

| Стойност | Channel Type | Контекст |
|----------|-------------|----------|
| 2 | Search | Standard Search кампания. Има search terms, Quality Score, auction insights. |
| 3 | Display | Display Network кампания. Няма search terms. Има placements, audiences. |
| 6 | Video | YouTube Video кампания. Има placements, но не search terms. |
| 10 | Performance Max | PMax — blend от Search, Shopping, Display, YouTube, Discover, Gmail. Ограничена transparency. |
| 14 | Demand Gen | Discovery/Demand Gen кампания. YouTube, Discover, Gmail placements. |

**Implications за анализа:**
- advertisingChannelType = 2: Search Terms данни са НАЛИЧЕНИ и трябва да се изискат.
- advertisingChannelType = 10: Search Terms НЕ са директно налични, но PMax Search Categories/Insights могат да се извлекат.
- advertisingChannelType = 3, 6, 14: Няма search terms. Анализирай по placements, audiences, networks.
- Impression Share метрики (searchImpressionShare, searchLostISRank, searchLostISBudget) са налични САМО за Search (2) и PMax (10) кампании. За Display (3), Video (6) и Demand Gen (14) тези полета са null — това е нормално, не data gap.

### Правило 0C: Верифицирай изчисленията си — не hallucinate метрики

Преди да цитираш метрика в анализа, провери математиката:
- **CTR** = clicks / impressions. Пример: 44,947 / 79,790 = 0.5633 = 56.3%, НЕ 38.5%.
- **CVR** = conversions / clicks (за Search/Shopping) или conversions / impressions × вариации (зависи от контекста). Уточни кой denominator използваш.
- **Connected TV "CVR 30.9%"** = 20.09 conversions / 65 clicks = 30.9% click-to-conversion rate. Но 20.09 / 186,976 impressions = 0.01% impression-to-conversion rate. И двете са верни, но означават различни неща. В анализа уточни: "Click-to-conversion rate 30.9% при само 65 clicks" — това поставя аномалията в контекст (малък sample от clicks, вероятно VTC conversions атрибутирани към малко clicks).
- **ROAS** = conversionValue / cost. Винаги провери с raw числата.
- **CPA** = cost / conversions.

**Грешка от практиката:** Един от одитираните репорти цитира Brand Protection CTR като 38.5%, когато реалният е 56.3%. Друг цитира "Lost IS Budget 85.8%" за кампания, при която Budget loss е 0.5%. Тези грешки подкопават доверието в целия анализ.

### Правило 0D: Search Terms данни — протокол при липса

Search Terms Report (Блок 1) е най-критичният допълнителен блок данни. Ако е заявен, но НЕ е доставен в enriched JSON:

1. **Не продължавай с анализа сякаш данните не са нужни.** Branded leakage остава UNKNOWN.
2. **Изрично маркирай в Executive Summary:** "Search Terms данни бяха заявени, но не бяха доставени. Branded leakage статусът е UNKNOWN. Всички scaling препоръки са УСЛОВНИ и зависят от branded leakage верификация."
3. **Всяка scaling прогноза трябва да включва два сценария:** (a) при текущ composite ROAS (ако няма leakage), (b) при estimated post-cleanup ROAS (ако leakage е 20-40%).
4. **В Action Plan, Priority 1 ВИНАГИ е:** "Извлечете Search Terms Report ръчно от Google Ads UI" — дори ако анализът покрива други теми.
5. **Не downgrade-вай важността** — не пиши "липсва, но можем да работим без него". Branded leakage е gatekeeping insight за всяко scaling решение.

**Индикатори за branded leakage при липса на Search Terms:**
Ако нямаш Search Terms данни, използвай тези proxy сигнали (подредени по reliability):
- Homepage (/) с ROAS 2x+ над средното → висока вероятност brand traffic ландва на homepage
- DSA кампания с ROAS > 20x за generic vertical → DSA не може да негативира branded queries
- PMax ROAS > Search non-brand ROAS → PMax Search component вероятно хваща branded queries
- Кампания CTR > 25% при non-brand naming → вероятно branded queries inflate CTR

Тези proxy-та НЕ заместват Search Terms Report, но повишават или намаляват confidence за branded leakage хипотезата.

---

## ЗАДЪЛЖИТЕЛНИ БЛОКОВЕ ДАННИ (винаги изисквай)

### БЛОК 1: Search Terms Report

**Какво да вземеш:**
За всички ENABLED Search кампании (advertisingChannelType = 2), включително DSA:
- campaign_id, campaign_name, ad_group_id
- search_term, match_type
- impressions, clicks, cost, conversions, conversion_value

**Филтър:** conversions > 0 ИЛИ clicks >= 5 (хваща и high-spend non-converting terms).

**Класификация:** Добави поле \`is_branded\` (boolean). Маркирай като branded всеки термин съдържащ: brand name, домейн, известни вариации и правописни грешки. Ако не можеш да класифицираш автоматично, върни raw данни с инструкция за ръчна класификация.

**Агрегация:** Per campaign summary:
- total_conversions, branded_conversions, branded_conversion_pct
- branded_spend, branded_spend_pct
- non_brand_roas vs branded_roas (отделно)

**Как да интерпретираш:**

- **Branded leakage > 10% в non-brand кампании** = scaling решенията са базирани на inflated ROAS. Composite ROAS ще изглежда 25-35x, но реалният non-brand ROAS може да е 10-20x. Всяка scaling прогноза трябва да използва post-cleanup ROAS, не composite.
- **DSA кампании** заслужават отделно внимание — DSA по дефиниция не може да негативира branded queries на ad group ниво. Ако DSA показва висок ROAS (>20x) за furniture/eCommerce generic, подозирай branded leakage първо.
- **Branded leakage < 5%** = текущият ROAS е надежден baseline за scaling. Можеш да препоръчваш budget increase с по-висока confidence.
- **Ако Search Terms данни липсват:** изрично кажи, че branded leakage статусът е UNKNOWN, и че всяка scaling препоръка е условна. Препоръчай ръчен export от Google Ads UI преди каквото и да е budget increase.

---

### БЛОК 2: Conversion Action Breakdown

**Какво да вземеш в два среза:**

**2A — По device × conversion action:**
- device (MOBILE, DESKTOP, TABLET, CONNECTED_TV)
- conversion_action_name, conversion_action_type (PURCHASE, ADD_TO_CART, LEAD, PAGE_VIEW и т.н.)
- conversion_action_category (PRIMARY vs SECONDARY)
- conversions, conversion_value
- view_through_conversions (ако е достъпно)
- attribution_model (DATA_DRIVEN, LAST_CLICK и т.н.)

**2B — По campaign × conversion action:**
- campaign_id, campaign_name
- conversion_action_name
- conversions, conversion_value
- view_through_conversions

**Как да интерпретираш:**

- **Множество conversion actions в една кампания** (напр. PURCHASE + ADD_TO_CART като primary) = inflated conversion count. CPA изглежда нисък, но реалният purchase CPA е по-висок. Провери дали micro-conversions (add-to-cart, page_view, lead) са маркирани като PRIMARY — ако да, препоръчай преместване в SECONDARY.
- **AOV вариация между кампании > 2x** (напр. €134 vs €324) = или различни продуктови категории (легитимно), или различни conversion actions (проблем). Conversion action breakdown-ът разграничава двете.
- **View-through conversions (VTC) > 30% от total conversions** за Display/Video/Connected TV = attribution inflation. VTC при 30-дневен window за furniture означава, че потребителят е видял реклама, но е купил от друг канал (brand search, direct). Препоръчай намаляване на VTC window на 3-7 дни.
- **Connected TV CVR аномалия** (CVR > 5% за furniture display): почти винаги е VTC tracking issue. Нормалната Connected TV CVR за furniture е 0.1-0.5%. Ако виждаш CVR > 5%, първо провери VTC vs click-through split. Ако > 80% от конверсиите са VTC → това е root cause-ът.
- **Attribution model различия** между кампании (напр. една с DDA, друга с last-click) = cross-campaign comparison е misleading. Маркирай това като risk factor.

---

### БЛОК 3: Network/Placement Breakdown

**Какво да вземеш:**
За кампании с advertisingChannelType = 3 (Display), 6 (Video), 10 (PMax), 14 (Demand Gen):
- campaign_id, campaign_name
- network_type (YOUTUBE_WATCH, YOUTUBE_SEARCH, GOOGLE_DISPLAY_NETWORK, CROSS_NETWORK, CONNECTED_TV, GMAIL, DISCOVER и т.н.)
- impressions, clicks, cost, conversions, conversion_value
- view_through_conversions

**Как да интерпретираш:**

- **Connected TV placements с високи conversions** = кръстосана проверка с Блок 2A. Ако VTC е причината, Connected TV placement data ще покаже висок impression volume с минимални clicks, но значителни conversions → класическа VTC inflation.
- **YouTube Watch vs Display Network split** в Demand Gen кампании: YouTube обикновено има по-висок CTR (0.3-1.5%) но по-нисък CVR за furniture. Display Network има нисък CTR (0.05-0.3%) но може да има по-висок CVR ако е remarketing. Ако Display Network CVR > 2x YouTube CVR, подозирай audience leakage (remarketing audience маркиран като prospecting).
- **PMax network breakdown** разкрива къде PMax алокира бюджет: Search vs Shopping vs Display vs YouTube vs Discover. Ако > 50% от PMax spend е в Display/YouTube, но ROAS е висок, подозирай branded search queries вътре в PMax Search компонента (който издърпва средното).
- **Gmail и Discover placements** обикновено имат нисък CVR за high-ticket items. Ако показват висок ROAS, провери за VTC или micro-conversion inflation.

---

### БЛОК 4: Audience Segment Performance

**Какво да вземеш:**
За всички ENABLED кампании:
- campaign_id, campaign_name
- audience_segment_name (напр. "All visitors", "Past purchasers", "Similar to converters", in-market segments)
- audience_segment_type (REMARKETING, IN_MARKET, AFFINITY, CUSTOM_INTENT, SIMILAR)
- targeting_setting (TARGETING vs OBSERVATION)
- impressions, clicks, cost, conversions, conversion_value

**Как да интерпретираш:**

- **Remarketing audience генерира > 40% от conversions** в кампании маркирани като prospecting/AON = ROAS е inflated от warm traffic. Scaling ще unlock-не повече cold traffic с 2-5x по-нисък ROAS. Scaling прогнозите трябва да използват prospecting-only ROAS като baseline.
- **OBSERVATION vs TARGETING:** Ако audience-ите са в OBSERVATION mode, те не ограничават reach-а, но дават bid signal. Ако са в TARGETING mode, кампанията показва реклами САМО на тези audiences — което обяснява висок ROAS но ограничен scale.
- **In-market segments performance:** Ако конкретни in-market segments (напр. "Furniture buyers", "Home improvement") показват 3x+ ROAS спрямо средното, препоръчай: (a) bid adjustment за тези segments, (b) dedicated кампания с targeting на top segments.
- **Ако audience данни липсват:** кажи, че remarketing vs prospecting split-ът е UNKNOWN. Това е критично за scaling — без него не можеш да кажеш дали високият ROAS е sustainable при по-голям обем.

---

## СИЛНО ПРЕПОРЪЧИТЕЛНИ БЛОКОВЕ (изисквай когато са налични)

### БЛОК 5: PMax Search Term Insights

**Какво да вземеш:**
За PMax кампании (advertisingChannelType = 10), ако API-то поддържа:
- campaign_id
- search_category / search_term_insight / search_subcategory
- impressions, clicks, conversions, conversion_value
- category_label (branded vs generic, ако е налично)

**Как да интерпретираш:**

- PMax е black box за search queries. Search Term Insights (достъпни от 2023+) дават aggregated view на query categories.
- **Branded category > 20% от PMax conversions** = PMax канибализира Brand Protection кампанията. Препоръчай account-level brand exclusion list (Google Ads > Tools > Brand Lists).
- **Ако PMax Search Insights НЕ са достъпни:** маркирай PMax ROAS като "potentially inflated by branded queries". Не препоръчвай aggressive PMax scaling без тази видимост.
- **PMax с ROAS значително по-висок от dedicated Search non-brand кампании** (напр. PMax 32x vs Search non-brand 18x) = силен индикатор за branded leakage в PMax. PMax Search component улавя branded queries, които Brand Protection би хванала иначе.

---

### БЛОК 6: Auction Insights

**Какво да вземеш:**
За Brand Protection, top non-brand Search кампании и DSA:
- competitor_domain
- impression_share, overlap_rate, outranking_share
- position_above_rate
- top_of_page_rate, abs_top_of_page_rate

**Как да интерпретираш:**

- **Brand Protection:** Ако конкурент има > 20% overlap rate на branded terms, Brand Protection budget increase ще има defensive ROI (защита на branded traffic), не само offensive ROI (нови конверсии). Комуникирай това на stakeholders — "budget increase предотвратява загуба, не само генерира ръст".
- **Non-brand Search:** Ако top конкурент има > 60% impression share, scaling ще увеличи CPC (bid competition). Прогнозирай CPC increase 10-20% при budget +30%. Ако конкуренцията е ниска (top competitor < 30% IS), scaling е по-евтино — CPC increase ще е 0-5%.
- **Outranking share trend:** Ако нашият outranking share пада vs конкурент, но impression share расте → плащаме повече за по-ниски позиции. Това е QS/Ad Rank проблем, не budget проблем.
- **Ако Auction Insights липсват:** не можеш да прогнозираш CPC impact от scaling. Кажи, че scaling може да увеличи CPC с 5-25% depending on competitive density, и препоръчай мониторинг на CPC след всяко budget increase.

---

### БЛОК 7: Historical Comparison

**Какво да вземеш:**
Същите campaign-level метрики за:
- Предходен еквивалентен период (напр. предишна седмица)
- Year-over-year (същия период миналата година), ако има данни

**Как да интерпретираш:**

- **Предходен период с €0 spend** = акаунтът е бил на пауза или кампаниите са нови. Това е КРИТИЧЕН контекст — нов/реактивиран акаунт е в learning phase, и текущият ROAS не е stable baseline. Не прави scaling прогнози на база < 30 дни данни след рестарт.
- **Предходен период с данни** = можеш да изчислиш % change и да атрибутираш impact. Това е стандартният change impact analysis flow.
- **YoY comparison** е полезна за seasonality adjustment. Furniture има seasonality (peak Q4, post-holiday lull January, spring uptick March-April). Ако текущият период е seasonally weak, текущият ROAS е conservative baseline — scaling в peak season ще е по-ефективен.
- **Ако historical данни липсват:** кажи, че не можеш да определиш дали текущата performance е baseline, spike или dip. Препоръчай minimum 30 дни данни преди scaling.

---

## ИНТЕРПРЕТАЦИОННИ ПРАВИЛА (прилагай винаги)

### Правило 1: Не scaling-вай на база inflated metrics
Преди ВСЯКА scaling препоръка, провери:
1. Има ли branded leakage? (Блок 1) → Ако unknown, маркирай scaling като условно.
2. Има ли VTC inflation? (Блок 2) → Ако VTC > 30% от conv, преизчисли ROAS без VTC.
3. Каква част от ROAS идва от remarketing? (Блок 4) → Ако > 40%, scaling ще unlock cold traffic с по-нисък ROAS.

### Правило 2: Connected TV CVR > 5% е ВИНАГИ червен флаг
За furniture/eCommerce, Connected TV CVR над 5% е физически невъзможен без tracking error. Не го третирай като "интересен сигнал" — третирай го като "tracking проблем до доказване на противното". Диагнозата изисква Блок 2A + Блок 3.

### Правило 3: PMax ROAS > Search Non-Brand ROAS = подозрение за branded leakage
PMax е blend от Search, Shopping, Display и YouTube. Ако PMax ROAS е значително по-висок от dedicated non-brand Search кампании (напр. PMax 32x vs Search 18x), най-вероятната причина е branded queries вътре в PMax Search component. Препоръчай brand exclusion list преди scaling.

### Правило 4: Campaign с < 30 conversions = insufficient data
Smart Bidding (tROAS, Maximize Conv Value) учи на campaign ниво. При < 30 конверсии за периода:
- Не прави confident ROAS/CPA прогнози.
- Не препоръчвай aggressive scaling.
- Не сетвай tROAS targets — алгоритъмът няма достатъчно data points.
- Маркирай кампанията като "insufficient sample" и препоръчай изчакване или consolidation с други ниско-volume кампании.

### Правило 5: Lost IS breakdown (Budget vs Rank) променя препоръката ДИАМЕТРАЛНО
Прочети Правило 0A преди да интерпретираш Lost IS данни. Объркването на Budget и Rank е най-честата фактическа грешка в одитираните репорти и обръща scaling препоръката наопаки.

- **High Lost IS (Budget), Low Lost IS (Rank):** Budget increase ще unlock повече обем при сходен CPC. Scaling е ефективно.
- **High Lost IS (Rank), Low Lost IS (Budget):** Проблемът е Ad Rank / Quality Score, не бюджетът. Budget increase ще плати повече за същите позиции. Препоръчай QS improvements (landing page, ad relevance, expected CTR) ПРЕДИ budget scaling.
- **Mixed (и двете > 30%):** Combination approach — QS improvements + conservative budget increase (+10-15%).
- **PMax специфика:** PMax кампании често показват висок Lost IS Rank, защото PMax участва в mixed auctions (Search + Shopping + Display). Високият Rank loss в PMax не винаги означава QS проблем — може да е auction competition в Display/YouTube, където bid thresholds са различни. Интерпретирай PMax Lost IS с повече нюанс от Search кампании.
- **Ако breakdown-ът не е наличен:** препоръчай export с отделни колони за Lost IS (Budget) и Lost IS (Rank). Без този split, budget increase препоръка е partially blind.

### Правило 6: Landing page данни са part от performance story И branded leakage detection
Ако context block-ът съдържа landing page performance:

**Branded leakage proxy:**
- Homepage (/) с ROAS значително над средното (2x+) = почти сигурно brand traffic ландва на homepage. Свържи това с Находка 1 (branded leakage). Пример: ако homepage ROAS е 66.7x при account average 30.8x, homepage ROAS е по-близък до Brand Protection ROAS (61x) отколкото до non-brand average — силен индикатор, че значителна част от homepage traffic е branded.

**UX и traffic quality сигнали:**
- Конкретна продуктова страница с ROAS значително под средното = UX проблем, product-market fit проблем, или wrong traffic (non-relevant keywords водят до тази страница). Пример: /products/byura с ROAS 11.52x при account average 30.8x заслужава investigation.
- **Mobile share аномалия по landing page:** Ако повечето pages имат mobile share 88-91%, но конкретна page е 79% — това означава повече desktop traffic на тази page. Ако desktop CVR е по-висока, тази page може да performва добре за desktop, но слабо за mobile. Препоръчай mobile UX audit на конкретната page.
- Mobile % по landing page: ако mobile > 85% и CVR е нисък, mobile UX optimization е по-приоритетен от budget scaling.

**Protect vs Optimize:**
- Pages с CVR > 1.3x account average = Protect list. Всяка промяна трябва да е incremental (A/B test, 50/50 split), не full rollout.
- Pages с CVR < 0.7x account average = Optimize candidates. Провери: (a) traffic source quality, (b) mobile UX, (c) page load speed, (d) product relevance.

### Правило 7: Часови и дневни данни трябва да влизат в препоръките
Ако context block-ът съдържа hourly/day-of-week данни:
- **ROAS вариация > 30% между дни** (напр. Monday 39x vs Friday 26x) = ad scheduling тестване е warranted. Препоръчай bid adjustment или dayparting за high-ROAS дни/часове.
- **Peak conversion часове** = budget pacing трябва да осигури достатъчен budget за тези часове. Ако кампанията изчерпва daily budget преди peak hours, performance страда. Провери budget delivery method (Standard vs Accelerated).
- **Не препоръчвай aggressive dayparting** при < 100 conversions — sample size е insufficient за confident hourly patterns.

### Правило 8: Device performance е информативен, не actionable при Smart Bidding
Първо decode-вай bidding strategy от JSON-а (вж. Правило 0B). Никога не пиши "bidding strategy не е потвърдена" ако \`biddingStrategyType\` е наличен.

Ако кампаниите използват Smart Bidding (biddingStrategyType 9, 10, 11, 12, 13):
- Device bid adjustments се ИГНОРИРАТ от алгоритъма. Не препоръчвай "+20% Desktop bid".
- Desktop CVR 1.5-2x над Mobile CVR е НОРМАЛНО за high-ticket items (furniture, electronics). Не го третирай като проблем.
- Actionable device insight: Mobile UX optimization (landing page speed, simplified checkout), не bid adjustments.
- Connected TV е изключение — ако tracking е broken, трябва manual intervention (exclude placement или separate campaign).

Ако кампаниите използват Manual CPC (biddingStrategyType 2) или eCPC (3):
- Device bid adjustments РАБОТЯТ. Може да се препоръча: desktop +20-30%, mobile -10-15% (калкулирай на база CVR gap).
- Но преди да препоръчаш: провери дали CVR gap-ът е статистически значим (нужни са поне 50+ conversions per device за confident adjustment).

### Правило 9: Post-cleanup ROAS decline е ОЧАКВАН, не провал
Когато препоръчваш branded leakage cleanup:
- Винаги комуникирай ОЧАКВАН ROAS decline (30-70% на account level).
- Framing: "ROAS не пада — просто изолираме истинския non-brand ROAS, който винаги е бил по-нисък."
- Препоръчай separate reporting: branded ROAS vs non-branded ROAS в dashboard.
- Предупреди за stakeholder perception risk: "Ако не комуникираме предварително, ROAS decline ще изглежда като провал."

### Правило 10: Scaling прогнози трябва да включват diminishing returns
При budget increase прогнози:
- Не екстраполирай линейно (€1,000 при ROAS 30x ≠ €2,000 при ROAS 30x).
- Използвай retention factor: incremental ROAS = current ROAS × 0.70-0.85 (при +20-30% budget increase).
- При aggressive scaling (+50%+), retention drops further: 0.55-0.70.
- Brand Search е изключение: retention е по-висок (0.85-0.95) защото demand е organic и auction competition е predictable.
- Винаги давай range, не точна цифра: "incremental ROAS 18-22x" вместо "incremental ROAS 20x".

---

## ФОРМАТ НА ОБОГАТЕНИТЕ ДАННИ

Когато изискваш допълнителни данни от API-то, очаквай следната JSON структура:

\`\`\`json
{
  "customerId": "...",
  "dateRange": { "start": "...", "end": "..." },
  "searchTerms": {
    "raw": [ ... ],
    "summary": {
      "byCampaign": [
        {
          "campaign_id": "...",
          "total_conversions": 0,
          "branded_conversions": 0,
          "branded_conversion_pct": 0,
          "branded_spend": 0,
          "branded_spend_pct": 0,
          "non_brand_roas": 0,
          "branded_roas": 0
        }
      ]
    }
  },
  "conversionActions": {
    "byDevice": [ ... ],
    "byCampaign": [ ... ]
  },
  "networkPlacements": [ ... ],
  "audienceSegments": [ ... ],
  "pmaxSearchInsights": [ ... ],
  "auctionInsights": [ ... ],
  "historicalComparison": {
    "previousPeriod": [ ... ],
    "yearOverYear": [ ... ]
  }
}
\`\`\`

**Приоритет ако не всичко е достъпно:**
1. Search Terms + Conversion Actions (затваря 80% от unknowns)
2. Network/Placement (Connected TV диагноза)
3. Audience Segments (remarketing vs prospecting)
4. PMax Insights + Auction Insights + Historical (пълна картина)

Ако блок не е достъпен, кажи кой и защо, и препоръчай алтернативен начин за извличане (напр. ръчен export от Google Ads UI).

---

## ЧЕКЛИСТ ПРЕДИ ФИНАЛИЗИРАНЕ НА ANALYSIS

Преди да публикуваш impact analysis, провери:

**Данни и изчисления (Правила 0A-0D):**
- [ ] Lost IS полета: проверено ли е кое е Budget и кое е Rank? Сумата IS + Rank + Budget ≈ 1.0?
- [ ] Bidding strategy: decode-ната ли е от \`biddingStrategyType\`? Никъде не пише "не е потвърдена" ако данните са налични?
- [ ] CTR, CVR, ROAS, CPA: преизчислени ли са от raw данните? Няма ли hallucinated метрики?
- [ ] Connected TV CVR: уточнено ли е дали е click-based (conv/clicks) или impression-based (conv/impressions)?
- [ ] Search Terms данни: получени ли са? Ако НЕ — маркирано ли е изрично в Executive Summary и всички scaling препоръки условни ли са?

**Branded leakage (Блок 1 + proxy сигнали):**
- [ ] Branded leakage статус: CONFIRMED / DENIED / UNKNOWN? Ако UNKNOWN, маркирани ли са scaling препоръките като условни?
- [ ] Proxy сигнали проверени ли са: homepage ROAS аномалия, DSA ROAS, PMax vs Search non-brand ROAS gap?
- [ ] Post-cleanup ROAS decline: комуникиран ли е като очакван? Предложено ли е separate branded/non-branded reporting?

**Tracking integrity (Блок 2 + Блок 3):**
- [ ] Conversion tracking integrity: проверени ли са VTC settings, conversion action duplications, attribution model consistency?
- [ ] Connected TV (ако присъства): CVR < 5%? Ако > 5%, идентифициран ли е root cause?

**Campaign analysis:**
- [ ] Campaigns с < 30 conv: маркирани ли са като insufficient sample? Няма ли aggressive scaling препоръки за тях?
- [ ] Lost IS breakdown (Budget vs Rank): правилно ли е интерпретиран? Scaling препоръката съответства ли на breakdown-а (Budget loss → budget increase, Rank loss → QS improvements)?
- [ ] Landing page данни: интегрирани ли са в анализа? Homepage ROAS аномалия свързана ли е с branded leakage?
- [ ] Hourly/day-of-week данни: адресирани ли са ако показват > 30% вариация?

**Scaling прогнози:**
- [ ] Scaling прогнози: включват ли diminishing returns factor? Дадени ли са като range?
- [ ] При липса на Search Terms: включени ли са два сценария (с и без branded leakage)?
- [ ] Remarketing vs prospecting split: известен ли е? Ако не, маркиран ли е като risk за scaling?
- [ ] Device bid recommendations: съответстват ли на decoded bidding strategy (Smart Bidding = без device modifiers)?

## 7. СТИЛ И ТOНАЛНОСТ

- Пиши на български, технически термини оставяй на английски (ROAS, CPA, CVR, CPC, DSA, PMax)
- Бъди директен и конкретен — избягвай phrases като "значителен потенциал", "може да генерира"
- Когато не знаеш → кажи "не знаем, необходими са [конкретни данни]"
- Когато знаеш → дай числото с source
- Не се извинявай за ограниченията на данните — просто ги документирай и работи с каквото имаш
- Executive Summary: без jargon, 1 страница, фокус на business decisions
- Technical Report: пълен detail, всяко число с source, reproducible analysis
`;

export function buildAdvancedAnalysisPrompt(
  preparedData: PreparedData,
  context: any
): string {
  const { aggregatedSearchTerms, crossCampaignTerms, termCategorySummary, additionalData, metadata } = preparedData;

  // Filter top terms to avoid token limits, but pass strictly formatted JSON
  // The user wants "aggregatedSearchTerms" array available.
  // We'll pass the top 100 terms in JSON format.
  const topTerms = aggregatedSearchTerms
    .slice(0, 100)
    .map(t => ({
      searchTerm: t.searchTerm,
      totalImpressions: t.totalImpressions,
      totalClicks: t.totalClicks,
      totalCost: t.totalCost,
      totalConversions: t.totalConversions,
      totalConversionValue: t.totalConversionValue,
      calculatedROAS: t.calculatedROAS.toFixed(2),
      calculatedCPA: t.calculatedCPA.toFixed(2),
      calculatedCVR: t.calculatedCVR.toFixed(4),
      uniqueDays: t.uniqueDays,
      devices: t.devices,
      campaigns: t.campaigns,
      termCategory: t.termCategory
    }));

  const languageInstruction = metadata.language === 'en'
    ? 'IMPORTANT: Your entire response MUST be in English language.'
    : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

  const analysisData = {
    metadata,
    missingDataFlags: additionalData.missingDataFlags,
    termCategorySummary,
    crossCampaignTerms,
    additionalData: {
      campaignStructure: additionalData.campaignStructure || [],
      impressionShareData: additionalData.impressionShareData || [],
      auctionInsights: additionalData.auctionInsights || [],
      conversionActions: additionalData.conversionActions || [],
      audiencePerformance: additionalData.audiencePerformance || [],
      networkPerformance: additionalData.networkPerformance || [],
      pmaxInsights: additionalData.pmaxInsights || []
    },
    aggregatedSearchTerms: topTerms
  };

  return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== HANDOFF PROTOCOL: DATA INPUT ===

\`\`\`json
${JSON.stringify(analysisData, null, 2)}
\`\`\`

=== CONTEXT NOTE ===
Use the data provided in the JSON block above.
The "aggregatedSearchTerms" list contains the top ${topTerms.length} terms by cost.
Total unique terms: ${metadata.uniqueSearchTermsCount}.
`;
}

// ============================================
// HELPERS
// ============================================

const BIDDING_LABELS: Record<number | string, string> = {
  0: 'Unspecified', 1: 'Unknown', 2: 'Manual CPC', 3: 'Manual CPM',
  4: 'Manual CPV', 5: 'Maximize Conversions', 6: 'Maximize Conversion Value',
  7: 'Target CPA', 8: 'Target ROAS', 9: 'Target Impression Share',
  10: 'Manual CPC (Enhanced)', 11: 'Maximize Conversions',
  12: 'Maximize Conversion Value', 13: 'Target Spend',
};

function getBiddingLabel(code: number | string | undefined): string {
  if (code === undefined || code === null) return 'N/A';
  // If already a readable string (not a pure number), return as-is
  if (typeof code === 'string' && isNaN(Number(code))) return code;
  return BIDDING_LABELS[code] || BIDDING_LABELS[Number(code)] || 'Unknown Bidding Strategy';
}

// ============================================
// AD GROUP LEVEL ANALYSIS PROMPT (V3)
// ============================================

export const getAdGroupAnalysisPrompt = (data: any, language: 'bg' | 'en') => {
  const isEn = language === 'en';
  const adGroup = data.adGroup || {};
  const keywords = data.keywords || [];
  const ads = data.ads || [];
  const negativeKeywords = data.negativeKeywords || [];
  const searchTerms = data.searchTerms || [];

  const totalConversions = keywords.reduce((sum: number, k: any) => sum + (k.conversions || 0), 0);
  const totalCost = keywords.reduce((sum: number, k: any) => sum + (k.cost || 0), 0);
  const totalClicks = keywords.reduce((sum: number, k: any) => sum + (k.clicks || 0), 0);
  const totalImpressions = keywords.reduce((sum: number, k: any) => sum + (k.impressions || 0), 0);

  const languageInstruction = isEn
    ? 'IMPORTANT: Your entire response MUST be in English.'
    : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

  return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== AD GROUP ANALYSIS MISSION ===
Deep-dive analysis of a single ad group. Diagnose keyword health, ad creative effectiveness, match type strategy, and negative keyword coverage. Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STATISTICAL CONTEXT ===
Total conversions in this ad group: ${totalConversions}
Total cost: €${totalCost.toFixed(2)}
Total clicks: ${totalClicks}
Total impressions: ${totalImpressions}
${totalConversions < 30 ? 'WARNING: Conversion volume is below 30. All performance conclusions are DIRECTIONAL ONLY. Flag this explicitly in your analysis.' : 'Conversion volume is sufficient for directional analysis.'}
${totalConversions < 15 ? 'CRITICAL: Conversion volume is extremely low (<15). Avoid definitive performance claims. Focus analysis on structural issues, QS, and ad setup rather than conversion-based optimization.' : ''}

=== AD GROUP OVERVIEW ===
Name: ${adGroup.name || 'N/A'}
Campaign: ${adGroup.campaignName || 'N/A'}
Status: ${adGroup.status || 'N/A'}
Total Spend: €${(adGroup.cost || 0).toFixed(2)}
Conversions: ${adGroup.conversions || 0}
Conversion Value: €${(adGroup.conversionValue || 0).toFixed(2)}
ROAS: ${adGroup.roas || 'N/A'}x
CPA: €${adGroup.cpa || 'N/A'}
CTR: ${(adGroup.ctr || 0).toFixed(2)}%

=== KEYWORDS (${keywords.length} total) ===
${keywords.map((k: any) => `
Keyword: "${k.text}" [Match Type: ${k.matchType}]
- Quality Score: ${k.qualityScore || 'N/A'} | Exp. CTR: ${k.expectedCtr || 'N/A'} | Ad Rel: ${k.adRelevance || 'N/A'} | LP Exp: ${k.landingPageExperience || 'N/A'}
- Impressions: ${k.impressions || 0} | Clicks: ${k.clicks || 0} | CTR: ${(k.ctr || 0).toFixed(2)}%
- Cost: €${(k.cost || 0).toFixed(2)} | CPC: €${(k.cpc || 0).toFixed(3)}
- Conversions: ${k.conversions || 0} | Conv. Value: €${(k.conversionValue || 0).toFixed(2)}
`).join('\n')}

=== ADS (${ads.length} total) ===
${ads.map((ad: any) => `
Ad ID: ${ad.id}
- Type: ${ad.type || 'RSA'}
- Ad Strength: ${ad.adStrength || 'N/A'}
- Headlines (${ad.headlinesCount || 0}): ${ad.headlines?.join(' | ') || 'N/A'}
- Descriptions (${ad.descriptionsCount || 0}): ${ad.descriptions?.join(' | ') || 'N/A'}
- Final URL: ${ad.finalUrl || 'N/A'}
- Performance: Impr: ${ad.impressions || 0} | Clicks: ${ad.clicks || 0} | CTR: ${(ad.ctr || 0).toFixed(2)}% | Conv: ${ad.conversions || 0}
`).join('\n')}

=== NEGATIVE KEYWORDS (${negativeKeywords.length} total) ===
${negativeKeywords.length > 0
      ? negativeKeywords.map((nk: any) => `[${nk.matchType || 'BROAD'}] ${nk.text}`).join(', ')
      : 'No negative keywords found.'
    }

=== SEARCH TERMS SAMPLE (${searchTerms.length} available) ===
${searchTerms.length > 0
      ? searchTerms.slice(0, 30).map((st: any) => `"${st.searchTerm}" | Cost: €${(st.cost || 0).toFixed(2)} | Conv: ${st.conversions || 0} | ROAS: ${st.cost > 0 ? (st.conversionValue / st.cost).toFixed(2) : 0}x`).join('\n')
      : 'Search terms data not available. Note: Without search term data, broad match waste cannot be assessed. Recommend pulling Search Terms Report manually.'
    }

=== SPECIFIC ANALYSIS REQUIREMENTS ===

In the TECHNICAL ANALYSIS (Document 2), you MUST address each of these:

A. KEYWORD HEALTH
- Quality Score distribution and component-level diagnosis
- Match type overlap/cannibalization (check if multiple match types compete for the same queries)
- If any keyword has 0 impressions, diagnose WHY (cannibalization, low bid, low volume, or paused)
- Identify missing keyword opportunities based on the ad group's theme

B. AD CREATIVE AUDIT
- Count of active RSA ads vs Google's recommendation (2-3 per ad group)
- Ad Strength distribution — if majority are UNSPECIFIED or POOR, explain the likely cause
- Headline diversity analysis: are different value propositions being tested, or just variations of the same message?
- Identify seasonal or time-sensitive ads that may be outdated
- Landing page consistency: do all ads point to the same/appropriate landing page?
- If there are >3 RSA ads: recommend specific ads to pause (by ID) and explain why

C. MATCH TYPE STRATEGY
- Compare performance metrics across match types
- Assess whether broad match is adding value or creating waste
- If search terms data is available: estimate % of relevant vs irrelevant queries from broad match
- Recommend specific match type changes with rationale

D. NEGATIVE KEYWORD COVERAGE
- Assess quality and completeness of the negative keyword list
- Identify patterns (competitor names, irrelevant categories, informational queries)
- Suggest 10+ new negative keywords based on the ad group theme and common waste patterns
- Flag any negative keywords that might be blocking valuable traffic

E. STRUCTURAL OPPORTUNITIES
- Should this ad group be split into multiple, more specific ad groups?
- What subcategories or intent segments could benefit from dedicated ad groups?
- For each proposed new ad group: suggest 3-5 keywords + a headline direction

=== JSON OUTPUT (MANDATORY — AFTER BOTH DOCUMENTS) ===
At the very end of your response, provide a JSON block wrapped in \`\`\`json tags:
{
    "todos": [
        {
            "task": "Specific action description",
            "impact": "High|Medium|Low",
            "timeframe": "Immediate|Short-term|Medium-term",
            "category": "Keywords|Ads|Structure|Negatives|Match Type|Landing Page|Bidding",
            "estimated_lift": "Brief estimate, e.g. '+5-10% CTR' or 'Prevent ~€20/mo waste' or 'Not quantifiable — structural improvement'",
            "effort": "Low|Medium|High"
        }
    ]
}
`;
};


// ============================================
// REPORT TEMPLATE PROMPTS (V3)
// ============================================

export const REPORT_TEMPLATES = {

  quality_score_diagnostics: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    // Data comes pre-processed from buildQualityScoreRequest (lib/quality-score.ts)
    const { summary, keywords, adGroups, dateRange } = data;

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English. Use original English terms for Google Ads metrics.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език. Използвай оригиналните английски термини за метриките (Quality Score, Expected CTR, etc.).';

    // Helper for consistent formatting
    const fmt = (n: number | undefined, decimals = 2) => n != null ? n.toFixed(decimals) : 'N/A';

    // Safe access to summary properties with defaults
    const totalKeywords = summary?.totalKeywordsAnalyzed || 0;
    const lowQsKeywordsCount = summary?.keywordsWithQsBelowThreshold || 0;
    const avgQS = summary?.averageQualityScore || 0;
    const weightedAvgQS = summary?.weightedAvgQualityScore || 0;
    const adGroupsCount = summary?.adGroupsAnalyzed || 0;
    const periodStart = dateRange?.start || 'N/A';
    const periodEnd = dateRange?.end || 'N/A';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

=== ROLE ===
You are a Senior Performance Marketing Analyst specializing in Google Ads Quality Score optimization.
You combine statistical rigor with practical, implementable recommendations.
You never guess — you work only with the data provided.

=== MISSION ===
Analyze Quality Score patterns across keywords and ad groups.
Identify root causes of low QS and provide a prioritized fix plan to improve Ad Rank and recover Lost Impression Share (Rank).
Produce BOTH an Executive Summary and a Technical Analysis.

=== LANGUAGE ===
${languageInstruction}

=== SCOPE GUARDRAILS ===
- Work ONLY with the data provided. Do not assume Search Terms, Auction Insights, landing page speed, or any data not present in the input.
- If additional data would significantly improve the analysis, list it under "Next Data Needed" at the end — never fabricate it.
- Do not recommend budget or bidding changes unless the mechanism is strictly: QS → Ad Rank → IS(Rank).
- If qualityScoreHistory is missing for a keyword, analyze based on the current snapshot only. Do not infer or guess trends.
- Brand keywords (matching brandTokens) should be evaluated separately — low QS on brand terms has different root causes than generic terms.

=== STATISTICAL CONTEXT ===
Total Keywords Analyzed: ${totalKeywords}
Keywords with QS <= Threshold: ${lowQsKeywordsCount}
Average Quality Score: ${avgQS}
Weighted Avg QS (by Impr): ${weightedAvgQS}
Ad Groups Analyzed: ${adGroupsCount}
Analysis Period: ${periodStart} to ${periodEnd}

=== IMPACT MODEL (IS Recovery Estimation) ===
Use these conservative ranges when estimating Impression Share (Rank) recovery:

| Component Fix                        | Estimated IS(Rank) Recovery |
|---------------------------------------|-----------------------------|
| Expected CTR: BELOW_AVERAGE → AVERAGE | +3 to +8 pp                 |
| Ad Relevance: BELOW_AVERAGE → AVERAGE | +2 to +5 pp                 |
| LP Experience: BELOW_AVERAGE → AVERAGE| +2 to +6 pp                 |

Rules:
- When multiple components are improved, do NOT sum linearly.
- Cap total estimated recovery at +10–15 pp per ad group within 30 days.
- Always present estimates as ranges, never single numbers.
- Label all estimates as "conservative estimates based on typical patterns".

=== PRIORITIZATION FORMULA ===
Rank fixes by impact score:
  impact_score = cost × (7 - qualityScore) × searchLostIsRank_pct

=== ANALYSIS REQUIREMENTS ===

1. QS COMPONENT DIAGNOSIS (ranked by impact)
   - Which component (Expected CTR / Ad Relevance / LP Experience) is dragging QS down the most?
   - Quantify: how many keywords have each component as BELOW_AVERAGE?

2. ROOT CAUSE PATTERNS (clustered)
   - Group keywords by shared problems (e.g., "all keywords pointing to /products/garderobi have LP Experience = BELOW_AVERAGE")
   - Identify structural issues: too many keywords per ad group, match type misalignment
   - If qualityScoreHistory is available, flag keywords with declining QS as urgent

3. FIX PLAN — Three levels, always specific:
   a) Keyword-level fixes (match types, splitting, negatives)
   b) Ad-level fixes (RSA alignment, pinning, USP)
   c) Landing page fixes (content relevance, fold alignment)

4. MONITORING PLAN
   - Weekly QS check for fixed keywords (target: +1 QS within 14 days)
   - IS(Rank) trend for affected ad groups

5. NEXT DATA NEEDED (if any)
   - List specific data that would improve future analysis

=== OUTPUT FORMAT ===

## Executive Summary
- Maximum 8–10 bullets
- Lead with the single biggest QS problem and its estimated cost impact
- Include total estimated IS(Rank) recovery if all fixes are implemented (as a range)
- Actionable: each bullet should imply or state a clear action

## Technical Analysis

### 1. QS Component Diagnosis
Ranked table: Component | Keywords Affected | % of Total | Avg Spend per Keyword

### 2. Root Cause Patterns
Clustered by pattern type. Include affected keywords count and combined spend.

### 3. Fix Plan
Table format:
| Priority | Issue | Affected Keywords | Action | Level (KW/Ad/LP) | Est. IS Recovery | Implementation Time |
|----------|-------|-------------------|--------|-------------------|------------------|---------------------|
- Sort by impact_score descending
- Maximum 15 rows

### 4. QS Trend Alerts
Only if qualityScoreHistory data is present. Table:
| Keyword | Previous QS | Current QS | Change | Days Between | Risk Level |
|---------|-------------|------------|--------|--------------|------------|

### 5. Monitoring Plan
3–5 specific metrics to track weekly, with target values.

### 6. Next Data Needed
Bulleted list of specific data requests.

=== DATA INPUT ===

--- LOW QS KEYWORDS (Top by spend) ---
${(keywords || []).map((k: any) => `
Keyword: "${k.text}" (${k.matchType}) | Campaign: "${k.campaignName}" | Ad Group: "${k.adGroupName}"
- QS: ${k.qualityScore} | Exp.CTR: ${k.expectedCtr} | Ad Rel: ${k.adRelevance} | LP Exp: ${k.landingPageExperience}
- Impr: ${k.impressions} | Clicks: ${k.clicks} | Cost: ${fmt(k.cost)} | Conv: ${k.conversions}
- CPC: ${fmt(k.avgCpc, 3)} | Lost IS (Rank): ${fmt(k.searchLostIsRank)}%
- Final URL: ${k.finalUrl}
${k.qualityScoreHistory ? `- HISTORY: Prev QS ${k.qualityScoreHistory.previous} (${k.qualityScoreHistory.periodDaysAgo} days ago)` : ''}
`).join('\n')}

--- AFFECTED AD GROUPS ---
${(adGroups || []).map((ag: any) => `
Ad Group: "${ag.name}" (Camp: "${ag.campaignName}")
- Avg QS: ${ag.avgQualityScore} | Low QS Keywords: ${ag.keywordsWithLowQS}/${ag.keywordCount}
- Cost: ${fmt(ag.cost)} | Conv: ${ag.conversions} | Lost IS (Rank): ${fmt(ag.searchLostIsRank)}%
`).join('\n')}

=== JSON OUTPUT (MANDATORY — AFTER BOTH DOCUMENTS) ===
At the very end of your response, provide a JSON block wrapped in \`\`\`json tags:
{
    "todos": [
        {
            "task": "Specific action description",
            "impact": "High|Medium|Low",
            "timeframe": "Immediate|Short-term|Medium-term",
            "category": "QS Component|Structure|Ad Copy|Landing Page",
            "estimated_lift": "Brief estimate, e.g. '+3-5% IS'",
            "effort": "Low|Medium|High"
        }
    ]
}
`;
  },

  lost_is_analysis: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const campaigns = data.campaigns || [];
    const rankLostCampaigns = campaigns.filter((c: any) => c.searchLostISRank && c.searchLostISRank > 0.1);
    const budgetLostCampaigns = campaigns.filter((c: any) => c.searchLostISBudget && c.searchLostISBudget > 0.1);

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== LOST IMPRESSION SHARE DIAGNOSTIC MISSION ===
Separate quality issues (rank) from scaling opportunities (budget) and provide specific action plans.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== CAMPAIGNS WITH LOST IS (RANK) ===
${rankLostCampaigns.map((c: any) => `
Campaign: ${c.name}
- Lost IS (Rank): ${((c.searchLostISRank || 0) * 100).toFixed(1)}% | Lost IS (Budget): ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
- Current IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}%
- Spend: €${(c.cost || 0).toFixed(2)} | ROAS: ${c.roas || 0}x | Conversions: ${c.conversions || 0}
- Bidding: ${getBiddingLabel(c.biddingStrategyType)}
${c.targetRoas ? `- Target ROAS: ${c.targetRoas}x` : ''}${c.targetCpa ? `- Target CPA: €${c.targetCpa}` : ''}
`).join('\n')}

=== CAMPAIGNS WITH LOST IS (BUDGET) ===
${budgetLostCampaigns.map((c: any) => `
Campaign: ${c.name}
- Lost IS (Budget): ${((c.searchLostISBudget || 0) * 100).toFixed(1)}% | Lost IS (Rank): ${((c.searchLostISRank || 0) * 100).toFixed(1)}%
- Current IS: ${((c.searchImpressionShare || 0) * 100).toFixed(1)}%
- Spend: €${(c.cost || 0).toFixed(2)} | ROAS: ${c.roas || 0}x | CPA: €${c.cpa || 0} | Conversions: ${c.conversions || 0}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. 2x2 CLASSIFICATION MATRIX
Categorize each campaign:
- High Rank Lost + Low Budget Lost = Quality Problem (fix QS/ads)
- Low Rank Lost + High Budget Lost = Scaling Opportunity (increase budget)
- High both = Mixed (fix quality first, then scale)
- Low both = Healthy (monitor only)
Present as a table with campaign names.

2. QUALITY/RANK FIXES (for campaigns in "Quality Problem" quadrant)
- Identify likely QS issues
- Recommend bid adjustments vs structural fixes
- Estimate potential IS recovery if QS improves by 1-2 points
- Calculate the € value of recovered impressions (using current CTR and conversion rate)

3. SCALING OPPORTUNITIES (for campaigns in "Scaling Opportunity" quadrant)
- Validate performance first (is ROAS/CPA acceptable?)
- Recommend specific budget increases: +10%, +20%, +50% with projected impact
- Calculate potential conversion volume increase at each level
- Flag diminishing returns risk

4. PRIORITIZED ACTION PLAN
Combine all recommendations into the standard Action Plan table format, ordered by estimated € impact.

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Quality Fix|Budget Increase|Bid Adjustment|Structure", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
  },

  search_terms_intelligence: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const searchTerms = data.searchTerms || [];
    const nGramAnalysis = data.nGramAnalysis || null;
    const brandedKeywords = data.brandedKeywords || ['videnov', 'мебели виденов', 'виденов мебели'];

    const totalSearchTermCost = searchTerms.reduce((sum: number, st: any) => sum + (st.cost || 0), 0);
    const totalSearchTermConversions = searchTerms.reduce((sum: number, st: any) => sum + (st.conversions || 0), 0);

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== SEARCH TERMS INTELLIGENCE MISSION ===
Identify winning patterns, wasteful spend, and negative keyword opportunities.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STATISTICAL CONTEXT ===
Total search terms analyzed: ${searchTerms.length}
Total search term spend: €${totalSearchTermCost.toFixed(2)}
Total search term conversions: ${totalSearchTermConversions}

=== N-GRAM ANALYSIS ===
${nGramAnalysis ? `
Top Winning N-Grams (High ROAS/Value):
${nGramAnalysis.topWinning?.map((g: any) => `- "${g.gram}": ${g.conversions} conv, €${g.conversionValue?.toFixed(0)} value, ROAS ${g.roas?.toFixed(2)}x, Cost: €${g.cost?.toFixed(2)}`).join('\n')}

Top Wasteful N-Grams (High Spend, Low Performance):
${nGramAnalysis.topWasteful?.map((g: any) => `- "${g.gram}": €${g.cost?.toFixed(0)} spend, ${g.conversions} conv, ROAS ${g.roas?.toFixed(2)}x`).join('\n')}
` : 'N-Gram analysis not available.'}

=== BRANDED KEYWORDS (REFERENCE) ===
${brandedKeywords.join(', ')}

=== RAW SEARCH TERMS (Top 50 by spend) ===
${searchTerms.slice(0, 50).map((st: any) => `"${st.searchTerm}" | Cost: €${st.cost?.toFixed(2)} | Conv: ${st.conversions} | Value: €${(st.conversionValue || 0).toFixed(2)} | ROAS: ${st.cost > 0 ? (st.conversionValue / st.cost).toFixed(2) : 0}x`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. N-GRAM PATTERNS
- Which product categories/modifiers drive value?
- Which terms waste budget? Quantify the waste in €.
- Identify 1-word, 2-word, and 3-word patterns separately.

2. TOP WINNERS (5-10 terms)
For each: explain WHY it performs well (intent match, offer relevance, funnel position).

3. TOP WASTERS (5-10 terms)
For each: explain WHY it wastes budget and recommend action (negative keyword, match type change, or dedicated landing page).
Quantify: "Excluding these terms would have saved approximately €X."

4. BRANDED vs NON-BRANDED
- Spend allocation and ROAS comparison
- Is brand spend cannibalizing organic traffic?
- Non-brand volume opportunity

5. INTENT CATEGORIZATION
Categorize search terms into:
- High Intent (ready to buy): "buy X", "X price", "X delivery"
- Mid Intent (comparing): "X vs Y", "best X", "X reviews"
- Low Intent (browsing/informational): "X ideas", "how to choose X", "X dimensions"
Estimate spend allocation across intent tiers.

6. NEGATIVE KEYWORD RECOMMENDATIONS
15+ specific negative keywords with rationale, grouped by theme (informational, competitor, irrelevant category, etc.)

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Negative Keywords|Winning Terms|Bid Adjustments|Match Type|Structure", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
  },

  ad_strength_performance: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const adGroups = data.adGroups || [];
    const ads = data.ads || [];

    // Separate RSA-eligible (Search) from non-RSA (DSA, Display, Video)
    const NON_RSA_TYPES = ['SEARCH_DYNAMIC_AD'];
    const NON_RSA_CAMPAIGN_TYPES = ['DISPLAY', 'VIDEO', '6', '3']; // enum codes + strings
    const isRSAEligible = (ag: any) =>
      !NON_RSA_TYPES.includes(ag.adGroupType) &&
      !NON_RSA_CAMPAIGN_TYPES.includes(ag.campaignType);

    const searchAdGroups = adGroups.filter(isRSAEligible);
    const dsaAdGroups = adGroups.filter((ag: any) => !isRSAEligible(ag));

    // Cap to top 30 by spend to keep prompt size manageable
    const topSearchAdGroups = [...searchAdGroups]
      .sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0))
      .slice(0, 30);

    const poorSearchAdGroups = searchAdGroups
      .filter((ag: any) => ag.adStrength === 'POOR' || ag.adStrength === 'AVERAGE')
      .sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0));

    // Build ads-by-adGroupId lookup
    const adsByGroup = new Map<string, any[]>();
    for (const ad of ads) {
      const list = adsByGroup.get(ad.adGroupId) || [];
      list.push(ad);
      adsByGroup.set(ad.adGroupId, list);
    }

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== AD STRENGTH & COPY PERFORMANCE MISSION ===
Audit RSA ad strength and provide specific copy improvements to increase CTR and conversions.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== RSA-ELIGIBLE AD GROUPS (Top ${topSearchAdGroups.length} of ${searchAdGroups.length} Search, by spend) ===
${topSearchAdGroups.map((ag: any) => `
Ad Group: ${ag.name} | Campaign: ${ag.campaignName || 'N/A'}
- Ad Strength: ${ag.adStrength || 'N/A'} | Ads: ${ag.adsCount || 0} | Poor Ads: ${ag.poorAdsCount || 0}
- Spend: €${(ag.cost || 0).toFixed(2)} | CTR: ${(ag.ctr || 0).toFixed(2)}% | Conv: ${ag.conversions || 0} | ROAS: ${ag.roas || 0}x
`).join('\n')}

=== POOR/AVERAGE AD GROUPS — FULL AD COPY (Top 10 by spend) ===
${poorSearchAdGroups.slice(0, 10).map((ag: any) => {
      const groupAds = adsByGroup.get(ag.id) || [];
      return `
--- Ad Group: ${ag.name} | Strength: ${ag.adStrength} | Spend: €${(ag.cost || 0).toFixed(2)} ---
${groupAds.length > 0 ? groupAds.map((ad: any) => `
  Ad ID: ${ad.id} | Strength: ${ad.adStrength || 'N/A'} | Type: ${ad.type || 'N/A'}
  Headlines (${ad.headlinesCount || 0}/15): ${ad.headlines?.join(' | ') || 'N/A'}
  Descriptions (${ad.descriptionsCount || 0}/4): ${ad.descriptions?.join(' | ') || 'N/A'}
  Final URL: ${(ad.finalUrls || [])[0] || ad.finalUrl || 'N/A'}
  CTR: ${(ad.ctr || 0).toFixed(2)}% | Impr: ${ad.impressions || 0} | Conv: ${ad.conversions || 0}
`).join('') : '  (No individual ad data available)'}`;
    }).join('\n')}
${poorSearchAdGroups.length === 0 ? 'No POOR/AVERAGE search ad groups found.' : ''}

=== DSA / NON-RSA AD GROUPS (${dsaAdGroups.length}) ===
${dsaAdGroups.length > 0 ? dsaAdGroups.slice(0, 20).map((ag: any) => `
Ad Group: ${ag.name} | Type: ${ag.adGroupType || 'N/A'} | Campaign Type: ${ag.campaignType || 'N/A'}
- Spend: €${(ag.cost || 0).toFixed(2)} | CTR: ${(ag.ctr || 0).toFixed(2)}% | Conv: ${ag.conversions || 0}
`).join('\n') : 'None'}
NOTE: These ad groups use Dynamic Search Ads or non-search formats. Ad Strength does NOT apply. Do NOT recommend RSA copy improvements for these groups.

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

CRITICAL RULES:
- Exclude DSA/Display/Video ad groups from all RSA audit counts. UNSPECIFIED adStrength on DSA groups is EXPECTED — do NOT flag as a problem.
- Only count Search ad groups (adGroupType = SEARCH_STANDARD or similar) in "missing RSA" or "POOR Ad Strength" statistics.
- When reporting "X% of ad groups have POOR strength", the denominator MUST be RSA-eligible (Search) ad groups only (${searchAdGroups.length}), NOT total ad groups (${adGroups.length}).

1. AD STRENGTH AUDIT (Search ad groups only: ${searchAdGroups.length})
- Distribution: how many EXCELLENT / GOOD / AVERAGE / POOR among Search ad groups?
- Correlation between Ad Strength and CTR/conversions (if data permits)
- Ad groups exceeding 3 RSA ads: list them, flag the problem, recommend which to pause (by ID)

2. HEADLINE DIVERSITY ANALYSIS
For each POOR/AVERAGE ad group above, categorize its headlines into:
| Category | Examples |
|----------|----------|
| Brand | Company name, URL |
| Price/Promo | Discounts, installments, free delivery |
| Product Feature | Material, size, functionality |
| Trust | Warranty, reviews, years in business |
| Convenience | Online ordering, delivery speed |
| Emotion/Use case | Comfort, lifestyle, room-specific |

Flag ad groups where >70% of headlines fall in ONE category (= no real testing).

3. SEASONAL/OUTDATED AD CHECK
Identify ads with time-sensitive language (holiday names, month names, seasonal references). Flag any that appear outdated.

4. MESSAGE MATCH ANALYSIS
Keyword → ad copy → landing page consistency. Flag mismatches.

5. SPECIFIC COPY RECOMMENDATIONS
For the top 5 POOR/AVERAGE ad groups by spend, provide:
- 3 new headline suggestions per category gap (you have the current headlines above — be specific)
- 2 new description suggestions
- Pin recommendations (what to pin to Position 1/2 and what to leave dynamic)
- If headlines < 10 or descriptions < 3, explicitly note how many more are needed

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Ad Copy|Headlines|Descriptions|Message Match|Structure", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
  },

  budget_allocation_efficiency: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const campaigns = data.campaigns || [];
    const strategicBreakdown = data.strategicBreakdown || {};
    const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== BUDGET ALLOCATION EFFICIENCY MISSION ===
Evaluate strategic spend distribution and recommend budget reallocations for improved efficiency and growth.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STRATEGIC BREAKDOWN ===
${Object.entries(strategicBreakdown).map(([category, data]: [string, any]) => {
      const pct = totalSpend > 0 ? ((data.spend / totalSpend) * 100).toFixed(1) : 0;
      const categoryLabel = category === 'pmax_sale' ? 'PMax - Sale' :
        category === 'pmax_aon' ? 'PMax - AON' :
          category === 'search_dsa' ? 'Search - DSA' :
            category === 'search_nonbrand' ? 'Search - NonBrand' :
              category === 'upper_funnel' ? 'Video/Display' :
                category === 'brand' ? 'Brand' : 'Other';
      return `
${categoryLabel}:
- Spend: €${data.spend?.toFixed(0) || 0} (${pct}% of total) | Campaigns: ${data.campaigns || 0}
- Conversions: ${data.conversions?.toFixed(0) || 0} | ROAS: ${data.spend > 0 && data.conversions > 0 ? (data.conversions * 300 / data.spend).toFixed(2) : 'N/A'}x (estimated)`;
    }).join('\n')}

=== TOTAL ACCOUNT SPEND: €${totalSpend.toFixed(2)} ===

=== CAMPAIGNS BY CATEGORY ===
${campaigns.map((c: any) => `
${c.name} | Category: ${c.category || 'other'}
- Spend: €${(c.cost || 0).toFixed(2)} | ROAS: ${c.roas || 0}x | CPA: €${c.cpa || 0} | Conv: ${c.conversions || 0}
- Status: ${c.status} | Lost IS Budget: ${((c.searchLostISBudget || 0) * 100).toFixed(1)}%
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
CRITICAL DATA ACCURACY RULES:
- ONLY state "0 conversions" for a campaign if the data explicitly shows conversions = 0. Do NOT round down or generalize.
- Distinguish between PAUSED campaigns (0 spend, 0 conv — expected) and ACTIVE campaigns with low but non-zero conversions.
- When comparing campaigns within a category (e.g. Brand), report the EXACT conversion numbers from the data. Example: if Brand Protection has 64.7 conv and Brand+Store has 5.8 conv, say "Brand Protection drives the majority (≈87%) of brand conversions, while other active brand campaigns contribute modestly" — do NOT say "0% conversions in 3 of 4 campaigns".
- Every claim must be directly verifiable from the data above. If you are uncertain, say so.

In the Technical Analysis:

1. SPEND ALLOCATION TABLE
Present current allocation as a table: Category | Spend | % of Total | ROAS | CPA | Assessment (Over/Under/Balanced)

2. CATEGORY PERFORMANCE ASSESSMENT
For each category: is performance above/below expectations? Is spend proportional to its role?

3. OVER-PROTECTION ANALYSIS
Is Brand spend too high relative to non-brand?
Benchmark: Brand should be 15-25% of total for furniture eCommerce.
If over-indexed: estimate how much could be reallocated and the projected impact.

4. UNDER-INVESTED OPPORTUNITIES
Which categories are budget-limited with strong performance?
Cross-reference Lost IS (Budget) with ROAS/CPA.
Quantify: "Increasing budget by €X could yield approximately Y additional conversions."

5. THREE REALLOCATION SCENARIOS
Present as a table with projected outcomes:
| Scenario | Change | Projected Impact | Risk Level |
| Conservative (+10% shift) | ... | ... | Low |
| Moderate (+20% shift) | ... | ... | Medium |
| Aggressive (rebalance to benchmarks) | ... | ... | Higher |

For each scenario, show: source campaign(s), destination campaign(s), € amount, projected conversion change.

6. ACTION PLAN — TACTICAL EXECUTION DETAILS
For every recommended action, include ALL of the following:
- Tactical implementation steps — specific Google Ads platform navigation, settings, and values. Example: if recommending a daily budget change, state from what amount to what amount; if recommending negative keywords, provide concrete examples with match type; if recommending bidding strategy migration, describe the exact sequence and timeline.
- Numeric precision with honest confidence interval — instead of rounded ranges, give a specific projection with the formula used to calculate it, and explicitly state the confidence level and assumptions behind the number. When data is insufficient for a precise forecast, say so, but still provide a best estimate.
- Negative keyword and exclusion lists — when recommending Search Terms cleanup or brand exclusions, include specific keyword examples for exclusion (branded variations, irrelevant categories, informational queries) with match type and application level (campaign vs account level).
- Bidding strategy guidance — when a campaign needs to scale or optimize, state the current likely bidding strategy, the recommended one, and the migration path with a concrete timeline (week 1: X, week 3: Y).
- Preserve diagnostic rigor and the guardrails approach — they are critical. Do not sacrifice analytical honesty for tactical specificity. The goal is for the document to be sufficient for direct execution without additional clarification.

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Budget Increase|Budget Decrease|Reallocation|Optimization", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
  },

  campaign_structure_health: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const campaigns = data.campaigns || [];
    const adGroups = data.adGroups || [];
    const keywords = data.keywords || [];

    const avgAdGroupsPerCampaign = campaigns.length > 0 ? (adGroups.length / campaigns.length).toFixed(1) : 0;
    const avgKeywordsPerAdGroup = adGroups.length > 0 ? (keywords.length / adGroups.length).toFixed(1) : 0;
    const matchTypeDistribution = keywords.reduce((acc: any, k: any) => {
      const type = k.matchType || 'UNKNOWN';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== CAMPAIGN STRUCTURE HEALTH MISSION ===
Audit campaign and ad group structure for efficiency, identifying over-fragmentation and consolidation opportunities.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== STRUCTURE METRICS ===
- Total Campaigns: ${campaigns.length} | Total Ad Groups: ${adGroups.length} | Total Keywords: ${keywords.length}
- Avg Ad Groups per Campaign: ${avgAdGroupsPerCampaign}
- Avg Keywords per Ad Group: ${avgKeywordsPerAdGroup}

=== MATCH TYPE DISTRIBUTION ===
${Object.entries(matchTypeDistribution).map(([type, count]) => `- ${type}: ${count} keywords`).join('\n')}

=== CAMPAIGN BREAKDOWN ===
${campaigns.map((c: any) => {
      const campaignAdGroups = adGroups.filter((ag: any) => ag.campaignId === c.id);
      return `
Campaign: ${c.name} | Ad Groups: ${campaignAdGroups.length} | Spend: €${(c.cost || 0).toFixed(2)} | Status: ${c.status}`;
    }).join('\n')}

=== AD GROUP ANALYSIS (Top 30 by spend) ===
${adGroups.slice(0, 30).map((ag: any) => `
Ad Group: ${ag.name} | Campaign: ${campaigns.find((c: any) => c.id === ag.campaignId)?.name || 'Unknown'}
- Spend: €${(ag.cost || 0).toFixed(2)} | Conv: ${ag.conversions || 0} | Keywords: ${ag.keywordCount || 'N/A'}
`).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. STRUCTURE HEALTH SCORE
Rate overall structure: Healthy / Needs Optimization / Requires Restructuring
Justify with specific metrics.

2. FRAGMENTATION ANALYSIS
- Campaigns with 20+ ad groups (likely over-fragmented)
- Ad groups with <€10/month spend (management overhead exceeds value)
- Ad groups with 0 conversions and >€20 spend (candidates for pause/merge)
Present as a table: Ad Group | Spend | Conversions | Recommendation (Merge/Pause/Keep)

3. CONSOLIDATION OPPORTUNITIES
Specific merges: "Merge ad groups X, Y, Z into one group called [name]"
For each merge: explain the rationale and estimated impact on algorithm learning.

4. MATCH TYPE STRATEGY
- Is Broad Match driving value or waste? (Cross-reference with performance data)
- Broad Match + Smart Bidding effectiveness assessment
- Recommend specific match type changes per ad group

5. STRUCTURAL OPTIMIZATION PLAN
Present as the standard Action Plan table with specific structural changes, timeframes, and expected outcomes.

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Consolidation|Expansion|Match Type|Simplification|Pause", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
  },

  change_impact_analysis: (data: any, language: 'bg' | 'en') => {
    const isEn = language === 'en';
    const campaigns = data.campaigns || [];
    const changeDescription = data.changeDescription || 'No change description provided';

    const languageInstruction = isEn
      ? 'IMPORTANT: Your entire response MUST be in English.'
      : 'IMPORTANT: Целият ти отговор ТРЯБВА да бъде на български език.';

    return `${ANALYSIS_SYSTEM_PROMPT_V3}

${languageInstruction}

=== CHANGE IMPACT ANALYSIS MISSION ===
Quantify the impact of recent changes, separate actual impact from seasonality/noise, and recommend next steps.
Produce BOTH an Executive Summary and a Technical Analysis as specified in the output format.

=== CHANGE DESCRIPTION ===
${changeDescription}

=== PERIOD-OVER-PERIOD DATA ===
${campaigns.map((c: any) => {
      const prev = c.previous || {};
      const costChange = prev.cost ? (((c.cost - prev.cost) / prev.cost) * 100).toFixed(1) : 'N/A';
      const convChange = prev.conversions ? (((c.conversions - prev.conversions) / prev.conversions) * 100).toFixed(1) : 'N/A';
      const cpaChange = prev.cpa && c.cpa ? (((c.cpa - prev.cpa) / prev.cpa) * 100).toFixed(1) : 'N/A';
      return `
Campaign: ${c.name}
CURRENT: Spend €${(c.cost || 0).toFixed(2)} | Conv: ${c.conversions || 0} | CPA: €${c.cpa || 0} | ROAS: ${c.roas || 0}x
PREVIOUS: Spend €${(prev.cost || 0).toFixed(2)} | Conv: ${prev.conversions || 0} | CPA: €${prev.cpa || 0} | ROAS: ${prev.roas || 0}x
CHANGE: Spend ${costChange}% | Conv ${convChange}% | CPA ${cpaChange}%`;
    }).join('\n')}

=== ANALYSIS REQUIREMENTS ===
In the Technical Analysis:

1. CHANGE SUMMARY
Restate what changed, when, and the hypothesis behind it.

2. BEFORE vs AFTER (table format)
| Metric | Before | After | Change | Significant? |
For statistical significance: note whether the data volume supports conclusions.

3. IMPACT ATTRIBUTION
Separate:
- Direct impact of the change (what can be attributed with confidence)
- Potential external factors (seasonality, competitor activity, market changes)
- Noise (insufficient data to determine)

4. UNEXPECTED OUTCOMES
Flag anything that moved in the opposite direction from expectations.

5. CONFIDENCE ASSESSMENT
- HIGH: Clear signal, sufficient data (30+ conversions both periods), results align with hypothesis
- MEDIUM: Some signal, but short period or moderate data volume
- LOW: Insufficient data, too early to conclude
State which level applies and WHY.

6. RECOMMENDATION
Based on confidence level:
- HIGH confidence positive: Scale the change
- HIGH confidence negative: Revert
- MEDIUM: Continue monitoring for X more days/conversions
- LOW: Cannot conclude yet; specify what data threshold is needed

At the end, provide a JSON block wrapped in \`\`\`json tags:
{ "todos": [{ "task": "string", "impact": "High|Medium|Low", "timeframe": "Immediate|Short-term|Medium-term", "category": "Scale Change|Revert|Refine|Monitor", "estimated_lift": "string", "effort": "Low|Medium|High" }] }`;
  }
};

