-- ============================================================
-- Portfolio + collections wiring. Safe to run more than once.
-- Run in the Neon SQL editor after 1-schema.sql and 2-seed_lookups.sql.
-- ============================================================

-- One portfolio per disbursed proposal. The app also guards this in code;
-- the index is the backstop. Guarded because imported history might already
-- hold two portfolios for one proposal, in which case the index is skipped
-- (with a notice) instead of failing the whole script.
do $$
begin
  create unique index if not exists portfolios_proposal_uidx
    on portfolios (proposal_id) where proposal_id is not null;
exception when others then
  raise notice 'portfolios_proposal_uidx not created (duplicate proposal_id values exist): %', sqlerrm;
end $$;

create index if not exists portfolios_status_idx on portfolios (status);
create index if not exists portfolios_area_idx   on portfolios (area_code);
create index if not exists collections_checked_idx on collections (checked, audited);

-- Check: should list any proposal that has been disbursed but has no portfolio.
-- (Proposals disbursed before this update need their portfolio created: open
--  the proposal in Committee and press Save again.)
select pr.proposal_id
from proposals pr
left join portfolios pf on pf.proposal_id = pr.proposal_id
where pr.stage = 'Disbursed' and pf.portfolio_no is null;
