# Standard deduction (planning notes)

These notes are educational planning stubs for Elite Capital Engine Lab RAG — **not tax advice**.

- Federal taxable income is often estimated as AGI minus the greater of itemized deductions or the standard deduction.
- ECE's `lib/tax/brackets.ts` uses planning-year standard deduction constants for marginal bracket estimates only.
- FICA, state tax, NIIT, credits, and AMT are out of scope for the bracket helper.
- Re-verify numbers against the IRS Revenue Procedure for the filing year before any real filing decision.
