# FinAhead

FinAhead shows you what your money is already promised to, before you spend it. It reads your recent
transactions, works out which payments repeat, and shows the lowest your balance will get before your next
paycheck. You can add a purchase you're considering and see that number move. You decide what to do about it.

- Code: https://github.com/alyssaqle/FinAhead
- Live demo: coming soon
- Technical details: [docs/BENCHMARK.md](docs/BENCHMARK.md)

## The problem

Your banking app shows one number. That number is already spoken for. Rent, a card payment, a phone bill and a
student loan are all committed, but none of them have come out yet, so the balance on screen is always larger
than the truth.

You see that inflated number at the exact moment you're deciding whether to spend. The card goes through,
everything looks fine, and the problem arrives two weeks later when rent clears first and the overdraft fee
clears second.

Most people work this out from memory or a calculator, every single time they're unsure.

## Who it's for

The intended user is a student or recent graduate paying their own bills for the first time, with very little
cushion between paychecks.

I didn't want to take that on faith, so I tested it against a real anonymised bank account published for
research: 6,494 transactions over seven years. **For that person, FinAhead solves nothing.** They held about
£7,500 on average against roughly £143 a month of committed payments, under 2% of their balance. They don't
need a forecast. Their savings are the forecast.

That was more useful than a confirmation. It showed the problem isn't about having bills, because almost
everyone has bills. It's about how large those bills are compared to what's in the account right now. The same
£143 against the £400 a student actually holds is 36% of everything they have.

So this is not for people with savings. It's for people whose committed payments take a large share of their
balance, where the order things come out decides whether a purchase is survivable.

That is still a hypothesis. One real account disagreeing with my first guess is not the same as students
agreeing with my second. I haven't interviewed any students yet.

## How FinAhead solves it

1. You start with the sample account or import a CSV from your bank, then enter your current balance.
2. FinAhead finds the payments that repeat and estimates when the next one is due and for how much.
3. It lays out every expected payment between today and your next paycheck, with the running balance after
   each one, and marks the lowest point.
4. You add a purchase you're thinking about and watch that lowest point move.
5. If a prediction is wrong, you edit the amount or date, or mark it as not recurring, and everything
   recalculates.

An example: the sample account shows $2,140. Rent, a card payment, a gym membership, a phone bill and a
student loan all land before the next paycheck. FinAhead shows the balance bottoming out at $530.02 six days
before payday. Add a $350 weekend trip and that floor drops to $180.02. The app never says whether to take the
trip.

## What I prioritized for the MVP

I ranked risks by what would hurt someone most. Giving a confident wrong number is worst, missing a bill is
next, looking unpolished is last.

1. Never state a prediction as a fact. Every predicted payment is labelled as a prediction and shows the past
   payments it came from.
2. Make it correctable. If FinAhead is wrong about your rent, you fix it in two clicks and the forecast
   updates.
3. Refuse to give advice. No score, no "safe to spend" figure, no green light.
4. Prove the maths before claiming anything. I built a test suite with known right answers and checked every
   calculation against it.

I cut scope twice. The original plan was a full budgeting app with categories and monthly reports. I narrowed
it to a single question: what happens to my balance before payday. Then I cut the feature I'd assumed was the
whole product, a single "you can safely spend $420" number, because it hides every assumption at the moment
someone is trusting it. Weekly and annual bills, multiple accounts, and saving your history were left for
later.

## Trade-offs I made

| I chose | Over | Because | The cost |
|---|---|---|---|
| Showing the evidence behind each prediction | Showing one "safe to spend" number | A single number hides what it assumed, and it's wrong whenever your history is incomplete | More to read before you get an answer |
| Only predicting bills that repeat monthly | Predicting all your spending | A number you can't check is worse than no number | It misses annual bills like insurance, and day-to-day spending, so the floor is optimistic |
| Cautious rules about what counts as recurring | Catching more bills | Inventing a bill that isn't real damages trust more than missing one | It finds 86% of recurring bills rather than all of them |
| Running entirely in your browser | A server that saves your history | Nothing to upload means nothing to leak, and no reason to hesitate before trying it | Your data is gone when you close the tab |
| Fixed rules | An AI model | A forecast about rent must give the same answer twice and be explainable line by line | Less flexible with unusual patterns |
| Testing on a public research dataset | Only testing on data I made up | Data I invented would only prove the tool agrees with me | It's one account, so it shows the tool copes with real data, not how common the problem is |

## Tools and why

| Tool | Why I used it |
|---|---|
| TypeScript | Catches money and date mistakes before they run |
| React and Vite | Builds a fast app that runs as a plain website with no server behind it |
| Vitest | Runs the 188 automated checks on the financial calculations |
| No AI model | Predictions must be repeatable and explainable; an AI guess about someone's rent is neither |
| The browser's own File API | Reads your CSV on your device so it never gets uploaded anywhere |
| MoneyData, a public research dataset | 6,494 real anonymised bank transactions, published under an open licence, to test on data I didn't create |

## Results so far

- Every balance, low point and what-if calculation is correct **to the cent**, across 1,000 scenarios on 200
  test accounts with known right answers.
- Against the real bank account, it reproduced **98.88%** of the bank's own published balances.
- It correctly identifies **92%** of recurring bills, and almost never claims a bill that isn't one.
- 188 automated tests, all passing.
- Whether it actually helps anyone decide is **not measured**. A session with five students is the next step.

The accuracy numbers show the tool calculates correctly. They don't show that it changes what anyone does.

## What's next

- Sit with five students, give them the $350 question, and watch where they get confused.
- Find out whether people read the evidence behind a prediction or ignore it.
- Add weekly and annual bills, which the current rules miss.
- Decide whether the investment preview is worth keeping based on whether anyone uses it.

FinAhead is an independent prototype. It isn't affiliated with any bank, it doesn't connect to real accounts,
and it isn't financial advice.
