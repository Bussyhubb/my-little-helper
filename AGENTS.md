<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- Backend is Lovable Cloud (Postgres + auth). Permissions are enforced by RLS policies using `has_role` / `is_manager` / `has_any_role` security-definer functions; UI hiding is only cosmetic.
- Roles live only in `user_roles`; the first signup becomes `owner` (trigger `handle_new_user`). Other users are created by managers through server functions in `src/lib/team.functions.ts` (service-role client loaded inside handlers).
- Sensitive costs live in separate tables (`product_costs`) so agents cannot read them via row policies.
- Money is `numeric(14,2)` in Naira; never floats in the DB. Format with `naira()` from `src/lib/session.tsx`.
- Master data is soft-deleted (`is_active`); audit via `audit_row()` trigger into `audit_logs`.
- Protected pages live under `src/routes/_authenticated/` (client-only gate, `ssr: false`).
- Stock is append-only ledgers (`material_ledger`, `product_ledger`); balances come from `*_stock` views. Posting (receive purchase, bottling, adjustments) happens only via security-definer RPCs that maintain weighted-average cost, so stock moves are atomic and unforgeable.
- Build phases: 1 (auth, roles, products, suppliers, customers, settings, audit) and 2 (materials, purchases, bottling) are done; later phases (purchasing, stock ledger, bottling, sales, payments, commissions, reports) must add append-only ledger tables with RLS.
