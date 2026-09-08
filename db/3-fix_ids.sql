-- ============================================================
-- Strip the ".0" that crept onto every ID.
-- Excel stores IDs as numbers; the export read them as decimals,
-- so 100001 was written as "100001.0". The app's upload path writes
-- "100001", so left alone every member would end up stored twice.
--
-- Safe to run more than once. Runs as one transaction: it either
-- completes or changes nothing.
-- ============================================================
begin;

alter table proposals  drop constraint if exists proposals_profile_id_fkey;
alter table portfolios drop constraint if exists portfolios_profile_id_fkey;
alter table portfolios drop constraint if exists portfolios_proposal_id_fkey;
alter table fprc       drop constraint if exists fprc_proposal_id_fkey;
alter table lmc        drop constraint if exists lmc_proposal_id_fkey;
alter table collections drop constraint if exists collections_portfolio_no_fkey;

-- 1. drop any ".0" row whose clean twin already exists
delete from members m where m.profile_id like '%.0'
  and exists (select 1 from members c where c.profile_id = regexp_replace(m.profile_id, '\.0$', ''));
delete from proposals p where p.proposal_id like '%.0'
  and exists (select 1 from proposals c where c.proposal_id = regexp_replace(p.proposal_id, '\.0$', ''));
delete from portfolios f where f.portfolio_no like '%.0'
  and exists (select 1 from portfolios c where c.portfolio_no = regexp_replace(f.portfolio_no, '\.0$', ''));

-- 2. rewrite the survivors, keys and the columns that point at them
update members    set profile_id   = regexp_replace(profile_id,   '\.0$', '') where profile_id   like '%.0';
update members    set old_mcl      = regexp_replace(old_mcl,      '\.0$', '') where old_mcl      like '%.0';
update proposals  set proposal_id  = regexp_replace(proposal_id,  '\.0$', '') where proposal_id  like '%.0';
update proposals  set profile_id   = regexp_replace(profile_id,   '\.0$', '') where profile_id   like '%.0';
update proposals  set old_mcl      = regexp_replace(old_mcl,      '\.0$', '') where old_mcl      like '%.0';
update portfolios set portfolio_no = regexp_replace(portfolio_no, '\.0$', '') where portfolio_no like '%.0';
update portfolios set profile_id   = regexp_replace(profile_id,   '\.0$', '') where profile_id   like '%.0';
update portfolios set proposal_id  = regexp_replace(proposal_id,  '\.0$', '') where proposal_id  like '%.0';
update fprc       set proposal_id  = regexp_replace(proposal_id,  '\.0$', '') where proposal_id  like '%.0';
update lmc        set proposal_id  = regexp_replace(proposal_id,  '\.0$', '') where proposal_id  like '%.0';
update collections set portfolio_no = regexp_replace(portfolio_no,'\.0$', '') where portfolio_no like '%.0';

-- 3. clear pointers that now lead nowhere, so the keys can go back on
update proposals  set profile_id  = null where profile_id  is not null
  and not exists (select 1 from members where profile_id = proposals.profile_id);
update portfolios set profile_id  = null where profile_id  is not null
  and not exists (select 1 from members where profile_id = portfolios.profile_id);
update portfolios set proposal_id = null where proposal_id is not null
  and not exists (select 1 from proposals where proposal_id = portfolios.proposal_id);
delete from collections where portfolio_no is not null
  and not exists (select 1 from portfolios where portfolio_no = collections.portfolio_no);

alter table proposals  add constraint proposals_profile_id_fkey
  foreign key (profile_id) references members(profile_id);
alter table portfolios add constraint portfolios_profile_id_fkey
  foreign key (profile_id) references members(profile_id);
alter table portfolios add constraint portfolios_proposal_id_fkey
  foreign key (proposal_id) references proposals(proposal_id);
alter table fprc       add constraint fprc_proposal_id_fkey
  foreign key (proposal_id) references proposals(proposal_id) on delete cascade;
alter table lmc        add constraint lmc_proposal_id_fkey
  foreign key (proposal_id) references proposals(proposal_id) on delete cascade;
alter table collections add constraint collections_portfolio_no_fkey
  foreign key (portfolio_no) references portfolios(portfolio_no);

commit;

select count(*) filter (where profile_id ~ '^[0-9]+$') as clean,
       count(*) filter (where profile_id like '%.0')   as still_dotted,
       count(*)                                        as total
from members;
