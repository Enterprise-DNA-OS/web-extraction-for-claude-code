create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create table sources (
 id uuid primary key default gen_random_uuid(), name text not null, url text not null,
 owner text not null, purpose text not null, permission_ref text not null,
 permission_until date not null, retention_review date not null,
 interval_hours integer not null default 24 check(interval_hours between 1 and 8760),
 status text not null default 'active' check(status in ('active','paused')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index source_name on sources(lower(name));
create table recipes (
 id uuid primary key default gen_random_uuid(), source_id uuid not null unique references sources(id),
 row_selector text not null, fields jsonb not null, key_field text not null,
 required_fields jsonb not null, min_rows integer not null check(min_rows>0), max_rows integer not null check(max_rows>=min_rows and max_rows<=10000),
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table runs (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references sources(id),
 mode text not null check(mode in ('import','file','fetch')), digest text not null, captured_at timestamptz not null,
 recipe_version integer not null, recipe_snapshot jsonb not null,
 status text not null check(status in ('complete','failed')),
 row_count integer not null default 0, issue_count integer not null default 0,
 error text not null default '', evidence_ref text not null, operator text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source_id,digest,captured_at,recipe_version,mode)
);
create table observations (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references runs(id), record_key text not null,
 payload jsonb not null, missing_fields jsonb not null default '[]',
 decision text not null default 'pending' check(decision in ('pending','accepted','held')),
 reviewed_by text, reviewed_at timestamptz, review_note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(run_id,record_key), check(decision<>'accepted' or (jsonb_array_length(missing_fields)=0 and reviewed_by is not null and review_note is not null))
);
create table tasks (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references sources(id),
 title text not null, owner text not null, due_date date not null,
 status text not null default 'open' check(status in ('open','closed')), resolution text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table audit_events (
 id uuid primary key default gen_random_uuid(), entity_id uuid not null, action text not null,
 operator text not null, reason text not null, evidence_ref text not null,
 before_value jsonb, after_value jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index observations_run on observations(run_id);
create index runs_source on runs(source_id,captured_at desc);
create index audit_entity on audit_events(entity_id,created_at);
do $$ declare t text; begin foreach t in array array['sources','recipes','runs','observations','tasks','audit_events'] loop
 execute format('create trigger touch before update on %I for each row execute function touch_updated_at()',t);
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public',t);
end loop; end $$;
create view latest_runs as select distinct on (source_id) * from runs where status='complete' order by source_id,captured_at desc,created_at desc,id desc;
create view current_records as select o.*,r.source_id,s.name as source,r.captured_at from observations o join latest_runs r on r.id=o.run_id join sources s on s.id=r.source_id;
create view source_health as select s.id,s.name,s.owner,s.status,s.permission_until,s.retention_review,
 r.captured_at as last_capture,r.row_count,r.issue_count,
 coalesce(r.captured_at + s.interval_hours*interval '1 hour',s.created_at) as next_due,
 (select count(*)::int from current_records c where c.source_id=s.id and c.decision='pending') as pending,
 (select count(*)::int from tasks t where t.source_id=s.id and t.status='open' and t.due_date<current_date) as overdue_tasks,
 exists(select 1 from recipes p where p.source_id=s.id) as has_recipe
 from sources s left join latest_runs r on r.source_id=s.id;
create view changed_records as select c.id,c.source,c.record_key,c.decision,c.missing_fields,c.payload,
 p.payload as previous_payload,case when p.id is null then 'new' when p.payload<>c.payload then 'changed' else 'unchanged' end as change
 from current_records c left join lateral (
 select o.id,o.payload from observations o join runs r on r.id=o.run_id join runs cr on cr.id=c.run_id
 where r.source_id=c.source_id and r.status='complete' and o.record_key=c.record_key
 and (r.captured_at,r.created_at,r.id)<(cr.captured_at,cr.created_at,cr.id)
 order by r.captured_at desc,r.created_at desc,r.id desc limit 1
 ) p on true;
create view compliance_gaps as
 select id,name,'SOURCE-01' as rule,'Collection permission review overdue' as finding from sources where permission_until<current_date
 union all select id,name,'NZ-IPP9','Retention review overdue' from sources where retention_review<current_date
 union all select id,name,'NZ-IPP1','Collection purpose is missing' from sources where trim(purpose)=''
 union all select id,name,'SOURCE-02','Permission evidence is missing' from sources where trim(permission_ref)=''
 union all select s.id,s.name,'QUALITY-01','Current records have missing required fields' from sources s where exists(select 1 from current_records c where c.source_id=s.id and jsonb_array_length(c.missing_fields)>0);
