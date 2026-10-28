# AI in coaching apps: research and lessons

Research notes for [AI.md](./AI.md), 2026-10-28. Two parts:

1. **Lessons from a production app.** What Sanctiv, an earlier app with a large AI surface
   (companion conversations, per-person memory, briefs for practitioners), learned in production.
   Written as patterns; the app's own code and incidents stay in its repository.
2. **What the leading fitness, health, coaching and goal apps do**, with sources, and what a
   framework's AI layer should copy.

This is reference material, not a decision. The decisions are in [AI.md](./AI.md). Legal points
here come from secondary summaries and need a legal read before anything is built on them.

## Part 0. Lessons from a production app

Sanctiv ran AI for journaling and pastoral care: a companion conversation, background synthesis
into a per-person memory and profile, weekly reports, between-session follow-up questions, and a
client-approved brief sent to the person's practitioner before a session. What carried over:

**What worked, and Genesis should keep**

- **Context in layers, with budgets and a manifest.** Each call's context was built from named
  layers (identity, profile, memories, recent entries, open questions, the previous session),
  each with a token budget, and every call recorded which layers went in. That manifest is what
  made a prompt redesign measurable.
- **Less context, better answers.** A "kitchen-sink" prompt of about 3,200 tokens was replaced by
  a short identity, a compact profile and a few retrieved memories (about 800–1,200 tokens), and
  manual evaluation preferred it.
- **A memory lifecycle.** Memories extracted from what the person wrote, each with a type,
  confidence and source quotes; reinforced when repeated; superseded (not overwritten) when
  contradicted, keeping when each held; consolidated and decayed nightly, only for people with
  enough recent activity; shown to the person as "what the AI knows about me", with review.
  Retrieval scored similarity, recency and reinforcement together.
- **Retrieve-or-omit for quoted text.** The model cited references only; verbatim text came from a
  trusted store, and anything that couldn't be verified was removed, fail-closed. The same pattern
  fits quoting a client's own words in a brief.
- **Consent before the prompt.** The brief for the practitioner was built only from what the
  client had chosen to share (sharing tiers, checked on the server), was approved section by
  section by the client, and only approved sections were sent.
- **Event pipelines that re-read the source.** Work triggered by a database event took only the
  row id from the event, re-read the row, re-checked ownership, and made each step idempotent and
  retryable on its own.
- **A capped nudge queue.** Between-session questions went into a per-person queue with a cap,
  quiet hours and a rescue window, and open questions fed back into the next conversation.

**What went wrong, and Genesis should design out**

- **Many ways to call a model**, with model names written into code in many places, a default
  temperature everywhere, and model-name checks to survive provider changes. A provider change
  that rejected a parameter broke calls in production.
- **A silent fallback to another vendor**, without consent.
- **Two memory pipelines with different rules**, so review behaved differently depending on which
  ran first.
- **Prompts editable at runtime without versions**, with A/B fields that nothing read.
- **Full prompts logged** with no retention policy.
- **Evaluations that mostly ran against canned responses.** The baseline scores for
  "personalisation" (0.08) and "growth tracking" (0.06) showed the goal of an AI that knows the
  person was not being met, and nothing failed because of it.
- **A deterministic crisis protocol that was decided but never built.**
- **Goals and progress barely supported.** A goal-suggestion function existed but read neither
  existing goals nor commitments, saved nothing, and was never shown. Progress compounded only
  through summaries feeding memory.
- **Schema changes silently changed AI inputs.** A column consolidation turned off a loop guard
  and an emotion signal without any test failing.
- **No budgets, and rate limits on only a few endpoints.**

## Part 1. What the leading apps do

**How to read the sources.** **[P]** marks a primary source: the vendor's own site, press release, help docs or regulator text. **[S]** marks a secondary source: press, reviews, competitor pages or aggregators. Several coach-platform claims rest only on vendor marketing or on comparison sites run by competitors, and are flagged where that matters. Some primary pages (WHOOP, Business Wire, the My PT Hub help centre, Noom engineering) could not be fetched directly; their contents come from search-result summaries and are marked **[P via S]**.

---

### Summary

1. **The leading consumer products have converged on one design.** It has five parts:
   - a **daily, state-aware brief** (morning outlook, evening review);
   - a **weekly plan with a weekly recap and adjustments**;
   - a **conversational coach grounded in the user's own data**;
   - an **explicit, user-editable memory**;
   - **proactive check-ins** triggered by events such as poor recovery, travel or an upcoming goal date.

   WHOOP, Oura, Fitbit/Google and Peloton all ship versions of this.
2. **Professional coaching platforms are far behind.** Their AI is mostly "draft a workout from text" (Trainerize, Everfit, TrueCoach, CoachRx RxBot, PT Distinction). The one clearly coach-in-the-loop *feedback* feature is **My PT Hub's Check-In AI**: the AI drafts check-in feedback and the coach reviews and sends it. Everfit has **Smart Response**, which drafts replies "in the coach's voice" for the coach to review, edit and send. A September 2026 review found that none of Everfit, Trainerize, TrueCoach or Hevy Coach markets AI check-in review. **This is the open space for a coaching framework.**
3. **Human-plus-AI is winning over AI-only in paid coaching.**
   - Future built an AI-only personal-training beta and **scrapped it in June 2026** to focus on human coaches.
   - BetterUp, Ezra, Omada and Noom all describe AI as handling routine work so human coaches have more capacity.
   - A Les Mills 2026 report (cited secondhand) found only 10% of consumers prefer AI workout guidance over a human coach.
4. **The gimmick failures look alike.** Strava's early Athlete Intelligence was called "vaguely positive but usually wrong". Garmin's Active Intelligence drew complaints about "basic maths, generic platitudes" and identical insights for different users, and a year later it "continues to restate thin insights". The Washington Post's ChatGPT Health test gave the same person grades from F to B on the same question and forgot his age and gender. **Generic text, LLM-computed numbers, inconsistency and over-confident health judgements** are what to design against.
5. **The leading engineering pattern** is the same at Google, Oura and Omada:
   - specialist sub-agents, including a **data-science agent that computes numbers in code**;
   - grounding in explicit frameworks;
   - large rubric-based evaluation, with clinicians writing rubrics and LLM judges cross-checked by humans;
   - regression benchmarks re-run whenever a model, prompt or data signal changes.

---

### Part A. Product by product

#### A1. Consumer fitness and health

**WHOOP: Coach, Daily Outlook, Day in Review, Weekly Plan, My Memory, Proactive Check-Ins, Advanced Labs**
- **What the AI does:**
  - WHOOP Coach launched in September 2023 on OpenAI GPT-4. It is a chat coach over the user's biometrics (strain, recovery, sleep, HRV, journal entries). [P] https://www.businesswire.com/news/home/20230926899032/en/5524842/WHOOP-Unveils-the-New-WHOOP-Coach-Powered-by-OpenAI-the-First-Wearable-to-Deliver-Highly-Individualized-Performance-Coaching-on-Demand
  - **Daily Outlook** (morning: metrics plus recommendations for the day) and **Day in Review** (evening snapshot plus the behaviours affecting sleep). [P via S] https://www.whoop.com/us/en/thelocker/introducing-whoop-coach-powered-by-openai
  - **Weekly Plan.** The user picks a focus (Sleep Deeper, Boost Fitness, Feel Better) or sets custom sleep, strain and behaviour goals. Coach sends reminders, and a summary at the end of the week shows which goals were met. The plan can only change at the start of a week. [P via S] https://www.whoop.com/us/en/thelocker/set-and-reach-your-goals-with-weekly-plan
- **Memory (May 2026).** **My Memory** has seven categories: Goals, Identity, Lifestyle, Preferences, Events, Health History and Mood. Users can view, add, edit or delete any entry, or turn memory off. Users log behaviours, supplements and life events by voice or text, and the AI *suggests* new memory items from patterns it detects. Temporary patterns, such as a past illness, are "remembered for context but not actively used to coach you." [P via S] https://www.whoop.com/us/en/thelocker/my-memory-whoop/ and https://businesswire.com/news/home/20260508464188/en/WHOOP-Expands-Health-Platform-with-On-Demand-Clinician-Access-and-New-AI-Features ; beta report [S] https://gadgetsandwearables.com/2026/05/08/whoop-memory/
- **Proactive Check-Ins (May 2026).** Unprompted messages based on stored context: before a big day, after a stretch of poor sleep, around a goal the user has shared, or when travelling. [P via S, same press release; S] https://www.digitalhealthnews.com/whoop-expands-health-platform-with-on-demand-clinician-access-new-ai-features
- **Where the human sits.** **On-demand clinician video visits** (paid extra, US) and Advanced Labs blood panels via Quest, with clinician-reviewed results that feed daily coaching (September 2025). The AI escalates to a clinician; there is no coach in the loop. [S] https://www.fiercehealthcare.com/digital-health/fitness-wearable-whoop-adds-demand-clinician-access-ehr-syncing
- **Guardrails and regulation.** The **FDA warning letter of 14 July 2025** over Blood Pressure Insights said the feature estimated systolic and diastolic BP and was therefore a device. WHOOP pushed back publicly. The letter was closed after WHOOP changed the feature and its labelling, under the January 2026 wellness guidance. [P] https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/whoop-inc-709755-07142025 ; [S] https://cloudgate.mobihealthnews.com/news/fda-closes-warning-letter-whoop-blood-pressure-insights-feature
- **Backlash.** Community posts say Daily Outlook ignored stated preferences even though Memory held them, and that Coach did not read Weekly Plan data. A staff reply confirmed the latter. In short, the features were not wired together. [S] https://www.community.whoop.com/t/daily-outlook-coach-not-learning-from-my-preferences/15543 , https://www.community.whoop.com/t/weekly-plan-progress/11583

**Oura Advisor**
- **Launch and scope.** In beta from July 2024, rolled out to all members 31 March 2025. A chat "health companion" over ring data. It can be proactive: from June 2025 it interprets metrics as they arrive. [P] https://www.businesswire.com/news/home/20250331565896/en/Oura-Advisor-an-AI-powered-Personal-Health-Companion-Now-Rolling-Out-to-All-Oura-Members ; [S] https://www.tomsguide.com/wellness/fitness/ouras-ai-powered-advisor-is-rolling-out-heres-what-it-means-for-you
- **Memory.** "Memories" persist; users can delete them or turn memory off, and can add context themselves (for example an injury). Conversation history only arrived in app 7.17.0 (June 2026). [S; P support page via S]
- **Women's-health model.** Proprietary; tested in Oura Labs February 2026 and inside Advisor April 2026. [S] https://ccstartup.com/blog/2026/02/24/ouras-latest-feature-puts-womens-health-at-the-center/
- **Guardrails and evaluation.** The most detailed public method among consumer apps. [P] https://ouraring.com/blog/how-oura-evaluates-generative-ai-to-earn-trust/
  - **Scenario tests:** each pairs a realistic member question, a *simulated data profile*, and must-do / must-never-do criteria written by clinicians.
  - **Graded dimensions:** scope and boundaries, escalation to a clinician, correct use of data and honesty about uncertainty, tone, clinical grounding.
  - **Non-negotiables:** stay in scope; no unsafe reassurance; **never invent personal context**; no advice that belongs to a clinician.
  - **Graders:** clinician-written rubrics for nuanced cases; an LLM-as-judge panel *drawn from several model providers* for tone, cross-checked against human grading.
  - **Metrics:** accuracy, recall, precision and false-positive rate per version, re-run whenever the model, prompt or data signal changes.
  - **GLP-1 case study:** a newer model raised precision from 90% to 100% but **recall stayed at 85.7%**. Oura states openly that a newer model can be better overall and worse on edge cases.
  - **Privacy:** conversations are siloed and never used to train third-party models.

**Google / Fitbit Personal Health Coach (Gemini)**
- **Rollout.** Public preview for US Fitbit Premium on Android from 28 October 2025. iOS plus UK, CA, AU, NZ and SG from February 2026. [P] https://blog.google/products-and-platforms/devices/fitbit/personal-health-coach-public-preview/ ; [S] https://www.thurrott.com/?p=332596
- **What it does:**
  - a 5–10 minute **onboarding conversation** about motivations and goals;
  - a **multi-week fitness plan** with a **weekly notification** of recommendations;
  - "Ask Coach" throughout the app;
  - plan changes for injury, a busy day or new equipment;
  - one-off workouts based on goals, readiness and recent activity;
  - insights timed to key moments (waking, after a workout, before bed);
  - workout feedback taken into future plans.
- **Architecture.** [P] https://research.google/blog/how-we-are-building-the-personal-health-coach/
  - a conversational agent, a **data-science agent** that fetches and analyses data and writes code, and **domain-expert sub-agents** (for example fitness) that build and adjust plans;
  - context includes personal baselines, population statistics, and checks that recent data exists before answering.
- **Evaluation.** The **SHARP** framework (Safety, Helpfulness, Accuracy, Relevance, Personalization); >1M human annotations; >100k hours of generalist and expert review; autoraters to scale; a Consumer Health Advisory Panel; and specialists in sports, sleep, family medicine, cardiology, endocrinology and behavioural science. Positioned as wellness, not a medical device; opt-in consent before Fitbit data is used.
- **Underlying research:**
  - **"The Anatomy of a Personal Health Agent"** [P] https://research.google/blog/the-anatomy-of-a-personal-health-agent/ . An orchestrator plus data-science, domain-expert and health-coach agents (the coach agent uses motivational interviewing). The DS agent writes and runs code, so the statistics come from code, not model arithmetic. Its analysis plans scored 75.6% vs 53.7% for the base model, and experts and users preferred the full orchestrated system over single-agent and parallel multi-agent baselines.
  - **PH-LLM** (Nature Medicine 2025, doi 10.1038/s41591-025-03888-0): about on par with experts for fitness; experts still better on sleep. [P] https://research.google/pubs/a-personal-health-large-language-model-for-sleep-and-fitness-coaching/

**Apple: Workout Buddy, and the shelved health coach**
- **Workout Buddy** (watchOS 26, September 2025). Spoken motivation during a workout, generated from workout data and fitness history (distance, rings, milestones, heart rate, pace). The voice is a TTS model trained on Fitness+ trainer voices. Off by default and enabled per workout type; needs headphones and an Apple Intelligence iPhone; processed "privately and securely" with Apple Intelligence. [P] https://www.apple.com/newsroom/2025/09/new-apple-intelligence-features-are-available-today/ ; [S] https://dcrainmaker.com/2025/06/apple-watchos-26-announced-workout-buddy-and-more-explained.html
- **Health coach "Project Mulberry"** was **scaled back in February 2026**. Some features (camera gait analysis, AI suggestions from Health data) are to arrive piecemeal in the Health app; the reporting says Apple doubted it could beat third-party apps. [S] https://9to5mac.com/2026/02/05/apple-reportedly-scales-back-plans-for-ai-powered-health-coach/
- **Lesson.** Even Apple chose narrow, well-bounded AI moments (in-workout encouragement) over an open-ended health coach.

**Strava: Athlete Intelligence**
- **What it does.** Generative summaries of each activity for subscribers. Beta October 2024; out of beta February 2025, with "more accurate insights, fewer mistakes" and a claim that 80%+ of polled subscribers found it helpful. Later added power, virtual activities, segments and progress comparisons. [S] https://www.androidcentral.com/wearables/strava-announces-stable-athlete-intelligence-anti-cheating-and-flyover-sharing
- **Backlash at launch.** "Vaguely positive but usually wrong", "pointless", memes; users looked for the opt-out. [S] https://fortune.com/2024/10/11/strava-app-artificial-intelligence-fitness-athletic-memes , https://cyclingweekly.com/news/strava-says-its-new-ai-feature-is-not-a-novelty-but-i-think-its-pointless
- **Runna** (acquired April 2025). Plans are **coach-written and adjusted by an algorithm**: pace targets move if you keep missing or beating them, and a "Not Feeling 100%" option adapts the plan and returns you to it. Runna says its plans are *not* generated by AI. [S] https://the5krunner.com/2026/09/28/is-runna-ai/

**Garmin: Connect+ Active Intelligence**
- **What it is.** Launched 27 March 2025 at $6.99/month. AI insights through the day (on waking, after workouts, in the evening) from sleep, HRV, training load and stress. Beta, promised to "become more tailored". [P] https://www.garmin.com/en-US/newsroom/?p=5556
- **Reception.** Strongly negative: "basic maths, generic platitudes, and outright incorrect information", with the *same* insight shown to different users. [S] https://www.techradar.com/health-fitness/smartwatches/garmins-new-subscription-ai-feature-is-hilariously-bad-so-far . A year on it "continues to restate thin insights". [S] https://the5krunner.com/2026/04/20/garmin-connect-plus-review/
- **This is the reference case for what a gimmick looks like.**

**Peloton IQ** (1 October 2025)
- Computer vision for form feedback, rep counting and suggested weights; **editable weekly plans** from goals, lifestyle and history; **weekly performance summaries with suggested changes** to plans and targets.
- Pulls in Garmin, Fitbit and Apple Health data. Before IQ, 800k+ members had started Personalized Plans. By Q2 FY26, Peloton said nearly half of active members engaged with the insights.
- Sources: [P] https://www.businesswire.com/news/home/20251001016206/en/ ; [S] https://www.axios.com/2025/10/01/peloton-cross-training-ai-bike , https://www.t3.com/active/peloton-iq-ai-training-demo

**Future** (human coach app)
- **February 2026:** split into an AI beta plus **Future Pro**, a human coach at $199/month.
- **June 2026:** **dropped the AI beta**. Members were told: "After spending time with the product and hearing feedback from members, we've decided not to move forward."
- **Current tiers:**
  - **Core, $129/month:** a personal fitness, nutrition and sleep plan, weekly check-ins, a monthly call, a DEXA scan and weekly food-log review.
  - **Premium, $399/month:** daily check-ins with same-day replies.
- The article does not say whether AI is used behind the scenes.
- Sources: [S] https://athletechnews.com/future-pulls-the-plug-on-ai-personal-training-commits-to-human-coaches/ , https://athletechnews.com/age-of-ai-human-personal-trainers-might-become-a-luxury-future-caliber/

**Ladder.** Coach-written team programmes with a new weekly plan per team, team chat, and 1:1 coach chat on the top tier. AI is limited to nutrition logging. It is still an Apple 2025 App of the Year finalist, which shows that a **structured human programme plus community** competes well without generative AI. [S] https://www.sensai.fit/blog/ladder-app-review-2026 ; [P] https://www.joinladder.com/llms.txt

**Fitbod.** Algorithmic rather than generative. Each muscle group gets a recovery percentage (0–100%); below 50% is "mostly fatigued". It folds in Apple Health, Fitbit and Strava cardio. Reviewers praise the recovery view but note limited control over programming. [P] https://fitbod.me/blog/fitbod-algorithm ; [S] https://lifting-apps.pages.dev/reviews/fitbod

**MacroFactor.** The best-known **deterministic adaptive coach**. It estimates energy expenditure from intake and weight trend, and adjusts calorie and macro targets at a **weekly check-in** "regardless of adherence". AI is used only for food logging (photo and label). [P] https://apps.apple.com/app/1553503471 . It shows an important split: **the number-crunching engine is deterministic; the LLM only handles input and explanation.**

**Hevy.** No confirmed native generative AI; Hevy Coach is a trainer platform for routines and chat. [S] https://www.g2.com/products/hevy-coach

**Noom: Welli and the GLP-1 Companion**
- Welli (June 2024) is an AI assistant plus AI food logging. Coaches are reached **by escalation from Welli**.
- The CEO says Welli is what made it possible to add 1:1 human coaching to the Premium tier.
- Staff reported early prototypes "felt cold" and it was "trivially easy to get Welli to hallucinate."
- The January 2025 GLP-1 update added medication and side-effect tracking and AI dynamic calorie goals.
- Sources: [P] https://www.fintechfutures.com/press-releases/noom-introduces-ai-enabled-products-to-enhance-on-demand-health-care-and-interactive-coaching ; [S] https://cosupport.ai/articles/noom-balances-ai-automation-human-care-support , https://techtarget.com/searchenterpriseai/news/366598870/Noom-CEO-on-the-need-for-AI-in-wellness-and-health
- An unverified secondary claim says coach headcount fell from about 2,700 to about 1,000 as LLM use grew. [S] https://sacra.com/chat/h/e328cde8-c950-46ff-8f75-bf136691516a

**Omada: OmadaSpark** (a strong pattern to copy)
- Fine-tuned Llama 3.1 8B trained on Omada care protocols, using motivational interviewing.
- **Refuses individual medical interpretation**, for example of a recent glucose reading.
- **Registered dietitians review outputs**; thumbs-up and thumbs-down go to annotation queues that feed fine-tuning.
- **Coaches receive summaries of each member's AI conversations.**
- Members always know they are talking to AI.
- Result: users were **3× more likely to return to the app**, and answers arrive in seconds rather than days.
- Sources: [P] https://aws.amazon.com/blogs/machine-learning/how-omada-health-scaled-patient-care-by-fine-tuning-llama-models-on-amazon-sagemaker-ai ; [P] https://www.omadahealth.com/resource-center/omada-introduces-nutritional-intelligence-to-transform-food-relationships-with-ai-driven-tools-and-human-care

**Eight Sleep.** Autopilot makes nightly temperature adjustments, a closed loop with no chat. A "Sleep Agent" (2026) recommends behaviour changes (earlier bedtime, no late meals) and connects via Apple Health and Health Connect. [S] https://news.crunchbase.com/venture/ai-powered-startup-eight-sleep-fitness-funding/

**Rise / Fabulous.** Rise reportedly added an "AI Expert" tier in December 2025 [S, unconfirmed]. Fabulous has no confirmed generative AI coach; its coaching is human. **Lumen:** nothing substantive found for 2025–26.

**ChatGPT Health** (general assistant; useful as a cautionary benchmark)
- Launched January 2026, wider US rollout July 2026. Connects Apple Health, US medical records, MyFitnessPal, Peloton and others.
- Has **memory separate from general ChatGPT**; **asks permission before using connected records**; memories are not created directly from records; data is not used for training.
- Sources: [P] https://openai.com/index/health-in-chatgpt/ ; [S] https://pasqualepillitteri.it/en/news/8783/chatgpt-health-medical-records-apple-health
- **Washington Post test (January 2026).** Given 29M steps and 6M heartbeats, it graded the reporter's cardiac health F, then **anywhere from F to B on repeated asks**, and forgot his age and gender. Eric Topol called it "baseless". Claude gave a C, but also failed to account for the limits of Apple Watch data. [S] https://www.macrumors.com/2026/01/27/chatgpt-apple-health-integration-flaws/

#### A2. Platforms for professional fitness coaches

| Platform | AI features (2025–26) | Coach in the loop? | Notes |
|---|---|---|---|
| **ABC Trainerize** | AI Workout Builder (open beta), built from client goals, history, equipment, age and weight. Conversational refinement; coach edits, then assigns. "Full programs coming soon." Claims programming is 50% faster (vendor figure). | Yes: AI drafts, coach reviews | No AI messaging or check-ins; the blog suggests using a general AI assistant for check-in messages. [P] https://www.trainerize.com/blog/?p=19574 ; [S] https://coachway.io/articles/best-ai-coaching-apps/ |
| **Everfit** | Olly AI Assistant (coach asks about a client's data); Olly Voice (dictate messages, assign habits); AI Workout Builder (notes or PDF to workouts); AI meal plans; MacroSnap; AI push-up rep counting; **Smart Response, which drafts client replies "in the coach's voice": "review, edit, and send"** | Yes, for replies | [P] https://everfit.io/ai-suite/ ; a review says chat and nutrition AI are "mostly marketing" [S] https://coachway.io/articles/best-ai-coaching-apps/ |
| **My PT Hub** | **Check-Ins AI**: analyses check-in submissions and **drafts personalised feedback; the trainer generates it, reviews and sends.** "Summarize, Simplify, Send." Claims 80% less check-in admin (unverified). | Yes | [P] https://www.mypthub.net/features/automated-client-check-ins/ ; help page (403) https://support.mypthub.net/hc/en-us/articles/40921997857681-Check-In-AI ; [S] review says it saves real time for coaches with 30+ weekly check-ins |
| **PT Distinction** | AI Program Builder, AI Meal Planner, AI Assistant (programs, meals, content, "answers common client questions instantly", "adjusts plans based on progress") | Not stated (a risk) | [P] https://ptdistinction.com/ai-coaching |
| **CoachRx (OPEX)** | **RxBot**: program design and exercise prescription from the client calendar, grounded in OPEX coaching principles; plus a prompt library | Yes (coach tool) | [P] https://coachrx.app/rxbot-ai-fitness-coaching-assistant , https://intercom.help/coachrx/en/articles/9325925-what-is-rxbot |
| **TrueCoach** | The blog mentions an AI Workout Builder; reviews say no native AI | — | [P] https://truecoach.co/blog/the-fastest-way-to-build-a-client-program-in-2025/ ; [S] conflicting |
| **Kahunas** | No AI found. Reported in "maintenance mode", "pulled back on flashy new features", with check-in reliability complaints | — | [S] https://marlvel.ai/intel-report/health-fitness/kahunas , Trustpilot |
| **Hevy Coach** | No AI marketed | — | [S] |

**What this means for the framework.** No incumbent fitness platform has a full AI check-in review loop. A complete loop would read a structured check-in plus logs and wearables, compare against the plan and last week, flag issues, draft feedback and propose plan changes, and send the coach's edited version. Two vendors have the drafting step; nobody has closed the loop.

#### A3. Life, executive and corporate coaching

- **BetterUp.**
  - **January 2025:** launched AI Coaching (role, personality and culture-aware; role-play practice) that "connects to expert human coaches when needed". Acquired **Heyday**, an AI that supports human coaches.
  - **Fall 2025:** "Human + AI Coaching for All". Unified reporting across human and AI coaching; AI in Slack and Teams; **calendar-aware coaching tied to upcoming meetings**; "Guardian HR agents" that embed company policy (pilot); **context sharing between human and AI coaches (planned early 2026)**; **AI-to-human coach recommendations**; admin privacy toggles (planned).
  - **Vendor metrics:** 95% satisfaction; +16% confidence; 34% prefer a human, 15% prefer AI, 51% want both. BetterUp Labs found employees use AI 16% more for immediate challenges, while humans lead by 13.5% on executive presence.
  - Sources: [P] https://www.betterup.com/press/betterup-launches-ai-coaching , https://www.betterup.com/platform-releases/fall-2025
- **CoachHub AIMY** (Q1 2025). An "active partner" grounded in coaching literature (cites Grant, Thaler and Sunstein, Kolb); customisable voice and persona; reviewed by its Science Council and ICF representatives. **No published outcome data.** Its research terms let CoachHub capture conversations for research, a consent point to note. Won an HR-tech innovation award in Japan in August 2025. [P] https://coachhub.com/en/news_media/coachhub-unveils-ai-coach-aimy , https://www.coachhub.com/fr/research-terms
- **Ezra (LHH).** **Cai** is an AI assistant *between* human sessions, for conversations and role-play simulations. It is explicitly not a standalone coach; AI handles "transactional elements" and humans do the transformational work. [P] https://www.helloezra.com/fr-fr/resources/insights/the-best-of-both-worlds-3-ways-ai-enhances-your-coaching-experience ; [S] https://risely.me/compare/risely-vs-ezra/
- **Rocky.ai.** AI-only daily reflection and micro-coaching. It asks reflective questions rather than giving answers, with a "mentor mode" that brings in curated resources, plus goal reminders. Users report repetitiveness; there is no human layer. It publishes a page on its own limitations. [P] https://help.rocky.ai/ai-chat/daily-micro-coaching , https://help.rocky.ai/app-features/your-ai-coach-understanding-the-limitations
- **Simply.Coach, Delenta, Satori, Practice, Paperbell.**
  - Simply.Coach: AI session notes, with a critique that its AI "starts from a standing start" for every coach.
  - Satori: a "Full Coaching Platform + AI Session Insights" tier (50 session analyses per month) and in-session question suggestions.
  - Delenta: AI listed for ROI and impact reporting to sponsors.
  - Practice and Paperbell: no confirmed AI.
  - All low-confidence [S]: https://between-sessions.pages.dev/simply-coach-review , https://us.fitgap.com/products/053093/satori , https://www.g2.com/products/delenta/features
- **Evidence base for AI coaching.** Terblanche's RCTs of the **Vici** chatbot: goal attainment improved significantly over 6–10 months, with an effect size about equal to human coaching (ηp² .269 vs .265). But **human coaches did better on wellbeing, resilience and stress**, and the participants were students self-reporting. [S/P] https://journals.sagepub.com/doi/10.24384/5cgf-ab69 , https://www.stellenboschbusiness.ac.za/news/stellenbosch-business-school-research-finds-ai-technology-rivals-human-coaching
- **Bloom** (arXiv October 2025, n=54 RCT). An LLM coach changed beliefs more than it changed short-term activity. [P] https://arxiv.org/pdf/2510.05449

#### A4. Goals, habits, productivity and OKR tools

- **Sunsama.** Manual *rituals* are the product: morning planning with an over-commitment warning; an evening shutdown that reviews the day and carries work forward; a weekly review that sets 3–5 objectives which daily plans then align to, plus a short journal. AI is minimal (Daily Highlights at shutdown, the "Sunny" voice assistant). [S] https://www.asianefficiency.com/schedule-management/sunsama-review/ . **Lesson: the ritual structure (plan, do, shut down, weekly review) is what compounds; AI can assist it without replacing it.**
- **Motion.** "AI Employees" (2025), including Millie, an AI project manager: projects built from SOPs or prompts, auto-scheduling by deadline, priority, duration and dependencies, off-track alerts, re-planning. The AI Employees tier is $894/month. Reviewers find auto-scheduling rigid when plans change late. [P] https://www.usemotion.com/ai-workflows ; [S] https://sacra.com/c/motion
- **Reclaim** (Dropbox). "Smart Habits" defend flexible time windows for routines such as exercise; meetings reschedule on conflict. [S] https://techcrunch.com/2024/08/22/dropbox-acquires-index-ventures-backed-ai-scheduling-tool-reclaim-ai
- **Todoist Assist.** **Task Assist "Break task down"** for goal decomposition; Ramble (voice to structured tasks, GA January 2026, Gemini 2.5 Flash Live); Filter Assist; Todoist Agents. [P] https://www.todoist.com/help/categories/todoist-and-ai/ai-features
- **Notion 3.0 Agents** (18 September 2025). The agent's **memory is an ordinary editable Notion page of instructions**; it runs multi-step jobs of 20+ minutes; scheduled or triggered Custom Agents. [P] https://www.notion.com/blog/introducing-notion-3-0 , https://www.notion.com/releases/2025-09-18
- **Linear Triage Intelligence.** The best model to copy for a coach approval queue:
  - LLM suggestions for team, project, assignee, labels and duplicates, each **with visible reasoning**, accepted or declined one by one;
  - **per-property auto-apply rules** (for example always apply team and assignee, but only certain labels);
  - guidance that cascades from workspace to team to sub-team, recommended to be used *reactively* when wrong patterns appear;
  - takes 1–4 minutes per issue; customer data is not used for training.
  - Source: [P] https://linear.app/docs/triage-intelligence
- **Lattice AI Agent in 1:1s** (GA June 2026). After each 1:1 it produces a summary by topic, **action items with owners**, and a **suggested next agenda that carries forward unresolved items and recurring themes**, plus coaching insights for both people. The record feeds **evidence-based review drafts**. Participants see when the agent joins and the host can remove it; permissions and retention controls apply. [P] https://lattice.com/blog/introducing-the-lattice-ai-agent-in-1-1s . **This is the clearest commercial example of progress that "stacks".**
- **15Five Kona** (May 2025). Takes notes in 1:1s and check-ins, then gives managers coaching on what to celebrate and where to focus, using engagement, review history and "wins, challenges, and behavior reports over time". Configurable to company values and frameworks; Slack nudges; any participant can pause it. [P] https://www.15five.com/products/kona , https://www.businesswire.com/news/home/20250520586200/en/
- **Fabulous, Streaks, Habitica.** No meaningful generative AI found.

---

### Part B. Synthesis

#### B1. Recurring product patterns

1. **A daily, state-aware brief.**
   - Examples: WHOOP Daily Outlook and Day in Review; Fitbit's moments (wake, post-workout, bedtime); Garmin's three daily insights; Oura's proactive interpretation.
   - Coaching analogue: a morning "today's plan, adjusted for how you are" and an evening "log and reflect".
2. **Weekly plan, then weekly recap, then adjustment.**
   - Examples: WHOOP Weekly Plan (changes only at week boundaries); Fitbit weekly recommendations; Peloton weekly summaries with suggested plan changes; MacroFactor's weekly check-in that changes targets; Sunsama's weekly review; Runna's pace adaptation.
   - **The week is the unit of compounding.**
3. **A conversational coach over the user's own data**, through an "Ask Coach" entry point available everywhere (WHOOP, Oura, Fitbit, Peloton, ChatGPT Health).
4. **Explicit, user-editable memory.**
   - Examples: WHOOP My Memory (typed categories, AI-suggested entries the user confirms, temporary vs active context); Oura Memories; Notion's instructions page; ChatGPT Health's separate health memory.
5. **Proactive, event-triggered check-ins**: WHOOP Proactive Check-Ins (before a big day, after poor sleep, around goals, when travelling); Oura proactive insights.
6. **Coach in the loop: AI drafts, the human approves.**
   - Fitness platforms: Everfit Smart Response, My PT Hub Check-In AI, Trainerize's draft-then-edit.
   - Elsewhere: Linear's accept/decline with auto-apply rules; Omada's dietitian review; and the FDA CDS guidance logic, where a provider "reviews, revises, and finalizes" the plan.
7. **The AI handles routine work and **hands off** to a human.**
   - Noom Welli escalates to coaches; BetterUp recommends a human coach; WHOOP and Oura direct users to clinicians; Ezra's Cai works between human sessions.
   - **AI conversation summaries go to the human** (Omada; BetterUp's planned context sharing).
8. **Meeting and session capture into an action-item graph.** Lattice (summary, owned action items, next agenda carrying forward open items, review evidence), Kona, Satori and Simply.Coach notes.
9. **Goal decomposition into scheduled tasks.** Todoist "break task down", Motion's projects from prompts plus auto-scheduling, Reclaim habits, Fitbit's multi-week plan built from the onboarding interview.
10. **Deterministic engine with an LLM explaining it.** MacroFactor's expenditure algorithm, Fitbod's recovery model, Runna's pace rules, Eight Sleep Autopilot. The LLM handles input (food photos, voice) and explanation, not the maths.
11. **Practice and simulation.** BetterUp and Ezra role-plays; Peloton computer-vision form feedback; Everfit rep counting.
12. **Onboarding by conversation.** Fitbit's 5–10 minute goals and motivation interview seeds the plan and memory.

#### B2. What separates leading implementations from gimmicks

| Leading | Gimmick |
|---|---|
| **Specific** to this person's data and goals, and makes a decision ("swap Thursday's intervals for Zone 2; your HRV is 18% below your 30-day baseline") | Generic platitudes; the same insight for different users (Garmin) |
| **Numbers computed in code** by a data-science tool (Google PHA), or by a deterministic engine (MacroFactor) | The LLM does arithmetic ("basic maths" errors at Garmin; inconsistent grades in ChatGPT Health) |
| **Grounded in a stated framework** (OPEX principles in RxBot, Omada care protocols, coaching literature in AIMY, motivational interviewing in Google's coach agent) | Free-form generation |
| **Connected features**: memory, plan and coach read the same state | Siloed AI bits (WHOOP Coach not reading Weekly Plan; Daily Outlook ignoring Memory) |
| **Bounded scope** with explicit refusal and escalation (Omada won't read your glucose; Oura's clinician-written must-never rules) | Over-confident health judgements ("cardiac grade F") |
| **Changes what happens next**: adjusts plan, targets or tasks (Peloton, Fitbit, MacroFactor, Runna) | Narrates the past ("great run!") with no action (early Strava) |
| **Large, continuous evaluation**: rubrics, clinician-labelled sets, cross-vendor LLM judges checked against humans, regression on every model change (Oura, Google SHARP) | Shipped on vibes; "beta" as the excuse |
| **Human relationship kept and multiplied** (Omada "force multiplier", Noom's freed coach time, BetterUp hybrid) | Replaces the coach; members reject it (Future scrapped its AI-only beta) |
| **User control**: editable memory, opt-out, visible reasoning (Linear), consent before using data (ChatGPT Health) | Opaque, always-on AI comments users hunt to disable (early Strava) |
| **Consistent**: same inputs give the same verdict | Grades swing F to B on repeated asks |

#### B3. Risks

**1. Medical and health-claim liability**
- **FDA General Wellness and CDS guidances (final, 6 January 2026).**
  - Wellness products may estimate physiological parameters non-invasively.
  - **A notification may suggest seeing a healthcare professional, but may not name a disease, call a reading abnormal, or include clinical thresholds.**
  - **CDS** software suggesting a treatment plan can qualify for enforcement discretion when a provider reviews, revises and finalises it. The guidance explicitly discusses **automation bias**.
  - Sources: [S, law-firm summaries] https://www.kslaw.com/insights/articles/fda-updates-general-wellness-and-clinical-decision-support-guidance-documents , https://www.foley.com/insights/publications/2026/01/digital-health-policy-fda-relaxes-restrictions-over-wearables-and-ai-decision-ma/ ; primary texts at fda.gov/media/90652 (General Wellness) and fda.gov/media/109618 (CDS). I did not read these directly.
  - The **WHOOP BPI warning letter** shows enforcement is real. [P] link above.
- **Mental health.** **Illinois HB 1806 / WOPR Act** (signed 4 August 2025) bars AI from providing therapy or making therapeutic decisions; fines up to $10k per violation. Self-help and peer support are excluded, but **there is no explicit coaching exemption**. Life-coaching AI must not present itself as therapy. [S] https://orrick.com/en/Insights/2025/08/Illinois-Enacts-Law-Regulating-AI-with-Sweeping-Implications-for-Behavioral-Health-Delivery
- **California SB 243** (in force 1 January 2026). Covers "companion chatbots": disclosure, a **crisis protocol for suicidal ideation**, rules for minors, annual reporting from July 2027, and a private right of action at $1,000 per violation. Whether a coaching chatbot is a "companion chatbot" depends on its design; get legal review, but build the crisis protocol regardless. [S] https://perkinscoie.com/insights/update/california-companion-chatbot-law-now-effect
- **App Store 1.4.1.** Medical apps get more scrutiny; accuracy claims about health measurements need disclosed methods; apps "should remind users to check with a doctor… before making medical decisions." [P] https://developer.apple.com/app-store/review/guidelines/

**2. Hallucinated numbers and inconsistency**
- Evidence: Garmin's errors; the ChatGPT Health test (grades from F to B, forgotten age and gender, wearable estimates such as VO2max and HRV treated as reliable); Noom staff's "trivially easy to hallucinate".
- Mitigation: compute with tools; show provenance; check consistency; state uncertainty about data quality, for example a new watch model or a gap in the data (Oura's rubric explicitly grades honesty about uncertainty).

**3. Health-data privacy**
- **App Store 5.1.2(i), revised 13 November 2025.** Apps must "clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so." Developer reports say a privacy-policy line is not enough and pre-checked boxes get rejected. [P] guidelines page; [S] https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai
- **App Store 5.1.3.** HealthKit, Motion & Fitness and clinical-records data may not be used or disclosed to third parties for advertising, marketing or data mining other than improving health management or research, and then only with permission. Apps must disclose the specific health data collected, **must not store personal health information in iCloud**, and must not write false data to HealthKit. [P]
- **Washington My Health My Data Act** (from 31 March 2024): separate opt-in consents to *collect* and to *share* consumer health data; covers fitness and wellness apps; private right of action. [S] https://www.natlawreview.com/article/unpacking-my-health-my-data-act-when-does-it-require-companies-get-consent
- **FTC Health Breach Notification Rule** (amended, effective 29 July 2024). Covers most non-HIPAA health apps; an "unauthorized disclosure", such as to an AI vendor without proper consent, counts as a breach. [P] https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule
- **Training and research use.** CoachHub's research capture of AIMY conversations and Oura's policy allowing data to refine AI features both need explicit consent design.

**4. Over-automation replacing the coach**
- Future's reversal; the consumer preference figures (10% prefer AI; BetterUp's 34/15/51 split); human coaches better on wellbeing and resilience in the Vici RCT.
- The **automation-bias** risk on the coach side: coaches rubber-stamping drafts. FDA CDS guidance names it, so design review UX that forces engagement on flagged items.

**5. Consent and transparency**
- Disclose AI vs human ("a member is always going to know who or what they're engaging with" – Omada).
- Opt-in per data source; meeting-recording visibility and pause controls (Lattice, Kona); deletion that really removes data (ChatGPT Health keeps conversation history after a source is disconnected).

---

### Part C. Implications for the framework's AI layer

#### C1. Data model

**The person context (memory).** Model it on WHOOP My Memory, Oura and Notion's instructions page.
- `MemoryItem { id, personId, category (goals|identity|lifestyle|preferences|events|health_history|mood|constraints|injuries), content, source (client_stated|coach_entered|ai_suggested|derived), status (proposed|active|temporary|archived), validFrom/validTo, visibility (client|coach|both), confidence, provenance (ref to message/check-in/log) }`
- Rules:
  - AI-suggested items stay `proposed` until the client or coach confirms (WHOOP's pattern).
  - `temporary` items inform but do not steer coaching (WHOOP).
  - Coach-only notes are kept separate from client-visible memory.
  - The whole context can be viewed, edited, exported and turned off.
- **A coach-authored "instructions" doc per coach and per programme** (Notion-style): tone, methodology, do-nots. This answers the Simply.Coach critique that AI "starts from a standing start" with each coach.

**The compounding graph** (goal → plan → task → check-in → reflection → next plan):
- `Goal` (outcome, metric, target, deadline, why/motivation, status) → `Milestone`
- `Plan` (versioned, covers a period, usually a **week**; `parentPlanVersionId`; `rationale`; `createdBy: coach|ai_draft_approved_by_coach|rule`)
- `PlanItem` / `Task` / `Habit` / `Workout` (scheduled; links to the goal or milestone)
- `Log` / `Observation` (workout sets, nutrition, wearable daily aggregates, habit completions), each with `source` and `quality` flags
- `CheckIn` (structured form response plus free text plus photos; references the plan version it answers)
- `Reflection` (client) and `Review` (coach and AI: summary, wins, blockers, flags, **proposedChanges[]**)
- `Decision` / `PlanChange` (accepted, edited or rejected proposals: the audit trail and the training signal)
- `Session` / `Meeting` (notes, transcript if consented) → `ActionItem` (owner, due, carried forward until done, as in Lattice)
- Every AI artifact stores `inputsSnapshotHash`, `model`, `promptVersion`, `toolsUsed` and `computedMetrics[]`, for reproducibility and evaluation.

The **weekly cycle** is the backbone (WHOOP, Fitbit, Peloton, MacroFactor and Sunsama all use it). The next plan is created **from** the last review's accepted `PlanChange`s, so progress stacks explicitly and is auditable.

#### C2. Primitives

1. **Typed structured outputs for every AI job.** For example `CheckInReview { summary, adherence: {...computed}, wins[], concerns[{severity, evidenceRefs}], questionsForClient[], proposedPlanChanges[{target, change, rationale, evidenceRefs}], draftMessageToClient, escalation?: {type: medical|mental_health|safety, reason} }`. Validate against a schema; reject free-form.
2. **A metrics tool layer, so the LLM never does arithmetic.** Deterministic functions (adherence %, trends against personal baselines, PRs, volume, weight trend, expenditure) are exposed as tools. The model may only cite numbers returned by tools, and the output carries `evidenceRefs`. This is the Google PHA data-science-agent pattern plus MacroFactor's deterministic engine.
3. **A coach approval queue, modelled on Linear Triage.**
   - Items: drafts (messages, check-in reviews, plan changes, new memory items) with visible reasoning and evidence.
   - Actions: accept, edit and send, reject with reason.
   - **Per-coach, per-type auto-apply rules** (for example auto-send encouragement on low-risk check-ins; always hold plan changes and any health flag).
   - Coach guidance that cascades from org to programme to coach to client, recommended to be added reactively when patterns go wrong.
   - Edits are captured as diffs: the main eval and personalisation signal.
   - Guard against automation bias: flagged items need an explicit look, and there is no "approve all" across flagged items.
4. **Scheduled and event-driven jobs.**
   - Scheduled: morning brief, evening prompt, **weekly check-in review and next-plan proposal**, pre-session prep for the coach, monthly or phase retrospective ("progress narrative").
   - Event triggers (WHOOP Proactive Check-Ins): missed sessions, an adherence drop, a goal date approaching, a negative-sentiment reflection, travel or a calendar event, a wearable recovery dip.
   - Every job is idempotent, rate-limited per person (avoid nagging), and respects quiet hours.
5. **Retrieval over a person's history.** Hybrid retrieval over check-ins, reflections, session notes, messages and memory, scoped and filtered by permission (coach-only vs client-visible). Recency and goal-linkage weighting. Bounded context packs per job, so jobs do not read everything every time.
6. **A routing and escalation classifier, run first on every inbound client message and check-in.** Categories: medical symptoms, injury, disordered eating, mental-health crisis or self-harm (SB 243-style protocol), medication or GLP-1 questions, minors. Escalation goes to the coach and/or shows resources; the AI does not answer.
7. **Policy and claims guardrails as configuration.**
   - Wellness-only language: no disease names, no "abnormal", no clinical thresholds (FDA 2026 wellness guidance).
   - A "see a professional" template; never diagnose or prescribe; respect per-programme scope, and do not present as therapy (Illinois).
   - Separate guardrail packs for fitness, nutrition and life/exec coaching.
8. **A consent and data-sharing registry.**
   - Per-source opt-ins (HealthKit, Health Connect, wearables, recordings).
   - **An explicit "send to third-party AI provider" consent screen**, default off (App Store 5.1.2(i)); separate collect and share consents (Washington MHMDA).
   - No health data in iCloud or ads; training and research use as its own opt-in.
   - AI vs human authorship labelled on every client-facing message.
9. **An orchestrator with specialist agents (keep it modest).**
   - Data analyst (tools only), domain expert (grounded in the coach's or programme's framework), coach/communicator (tone, motivational interviewing), and a **critic/evaluator pass** that checks the draft against evidence, policy and the client's memory before it reaches the queue. This is Google PHA's reflection loop.
   - Start with a single agent plus tools plus a critic; add specialists only when evals show the need.
10. **A session-capture module (optional, consented).** Summary, action items with owners, and a next agenda that carries forward open items (Lattice), feeding the weekly review.

#### C3. Evals that matter

Use Oura and Google as the template: scenario sets of synthetic person profiles plus a question or check-in, with rubrics and must/must-never criteria. Scoring combines LLM judges from more than one provider, calibrated against human (coach or clinician) grading. Run a regression suite on every model, prompt or tool change, and **track edge-case recall separately from the overall score**.

1. **Numeric fidelity.** Every number in the output appears in, or is derivable from, the tool outputs; zero invented metrics. Automate this.
2. **Groundedness and context fidelity.** Never invents personal context (Oura's non-negotiable); respects active memory and constraints such as injuries, equipment, schedule and preferences (the WHOOP failure); cites evidence.
3. **Safety and escalation.** Precision, recall and false-alarm rate on a labelled set of escalation-worthy cases: medical, mental health, disordered eating, minors. **Recall is the headline number** (Oura's flat 85.7% is the cautionary example).
4. **Claims compliance.** No diagnosis, disease naming, "abnormal" or thresholds; no therapy framing.
5. **Specificity and personalisation.** Cross-client swap test: would this output fit another client? Penalise generic text. Measures the Garmin failure directly.
6. **Consistency.** Same inputs repeated N times give the same verdict and recommendations (the ChatGPT Health F-to-B failure).
7. **Actionability and plan validity.** Proposed plan changes are feasible, progressive and within programme rules; for fitness, load-progression and recovery rules hold.
8. **Coach-voice fit.** Tone and methodology match the coach's instructions doc (Everfit's "in your voice").
9. **Production metrics (the real north star).** Coach acceptance rate and **edit distance** per draft type; rejection reasons; time saved per check-in; client response rate to AI-drafted vs fully human messages; retention; and, for compounding, goal attainment and adherence trends week over week. Omada's 3× return rate and Noom's freed coach capacity show which outcomes count.
10. **Privacy tests.** Coach-only memory never leaks into client-facing drafts; withdrawn consent removes the source from retrieval.

#### C4. Suggested phasing (ordered by risk and value)

1. **Coach-side only (no AI talks to clients).**
   - Check-in review drafts, message drafts in the coach's voice, programme and workout drafting from coach notes, session summaries with action items, all through the approval queue.
   - This fills the gap the incumbents leave and keeps liability low (CDS-style: the professional finalises).
2. **Weekly loop.** AI-proposed next-week plan built from the last review's accepted changes; progress narratives; a deterministic metrics engine.
3. **Client-facing, bounded.**
   - Daily brief, reflection prompts, an "Ask" assistant scoped to the programme and the client's own data.
   - The escalation classifier is mandatory.
   - Conversation summaries go to the coach (Omada and BetterUp patterns).
4. **Proactive, event-triggered check-ins** with per-client rate limits, after enough eval and production data on phases 1–3.

---

### Caveats

- Several coach-platform claims (My PT Hub's 80%, Trainerize's 50%, PT Distinction's capabilities) are vendor marketing with no method given.
- Comparison sites such as TrainerFu, Coachway and Arvo are run by competitors.
- The WHOOP Memory and Proactive Check-Ins details come from the May 2026 press release and the WHOOP help page, read via search summaries because the pages blocked direct fetch.
- The Future pivot rests on a single outlet (Athletech News).
- The FDA guidance texts were read through law-firm summaries, not directly. SB 243 and Illinois WOPR also need legal review before anything is built on them.
- I found nothing confirming AI features for Kahunas, Paperbell, Practice, Lumen, Fabulous, Streaks or Habitica. They may exist but were not findable.