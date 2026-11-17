do $$
declare a uuid:='10000000-0000-4000-8000-000000000001'; b uuid:='10000000-0000-4000-8000-000000000002'; c uuid:='10000000-0000-4000-8000-000000000003'; r1 uuid:='20000000-0000-4000-8000-000000000001'; r2 uuid:='20000000-0000-4000-8000-000000000002'; r3 uuid:='20000000-0000-4000-8000-000000000003';
begin
 if exists(select 1 from sources where id=a) then return; end if;
 if exists(select 1 from sources) then raise exception 'Seed requires an empty demo database'; end if;
 insert into sources(id,name,url,owner,purpose,permission_ref,permission_until,retention_review,interval_hours,status) values
 (a,'Harbour supplier catalogue','https://supplier.example/catalogue','Mere','Review permitted product specifications','fictional:permission-harbour',current_date+90,current_date+180,24,'active'),
 (b,'Alpine distribution list','https://alpine.example/products','Noah','Review permitted availability','fictional:permission-alpine',current_date-3,current_date-1,24,'active'),
 (c,'Coastal specification sheets','https://coastal.example/catalogue','Ana','Compare supplier dimensions','fictional:permission-coastal',current_date+60,current_date+120,48,'paused');
 insert into recipes(source_id,row_selector,fields,key_field,required_fields,min_rows,max_rows)
 select id,'.product','{"sku":{"selector":".sku"},"name":{"selector":".name"},"stock":{"selector":".stock"}}','sku','["sku","name","stock"]',1,1000 from sources;
 insert into runs(id,source_id,mode,digest,captured_at,recipe_version,recipe_snapshot,status,row_count,issue_count,evidence_ref,operator) values
 (r1,a,'import','fictional-first',now()-interval '8 days',1,'{}','complete',2,0,'fictional:first-export','Demo operator'),
 (r2,a,'file','fictional-current',now()-interval '2 days',1,'{}','complete',3,1,'fictional:current-capture','Demo operator'),
 (r3,b,'import','fictional-alpine',now()-interval '9 days',1,'{}','complete',1,0,'fictional:alpine-export','Demo operator');
 insert into observations(run_id,record_key,payload,missing_fields) values
 (r1,'HB-10','{"sku":"HB-10","name":"Storage crate","stock":"18"}','[]'),
 (r1,'HB-20','{"sku":"HB-20","name":"Packing tray","stock":"22"}','[]'),
 (r2,'HB-10','{"sku":"HB-10","name":"Storage crate","stock":"6"}','[]'),
 (r2,'HB-20','{"sku":"HB-20","name":"Packing tray","stock":""}','["stock"]'),
 (r2,'HB-30','{"sku":"HB-30","name":"Dividers","stock":"44"}','[]'),
 (r3,'AL-9','{"sku":"AL-9","name":"Carry case","stock":"12"}','[]');
 insert into tasks(source_id,title,owner,due_date) values
 (a,'Confirm missing stock field with source owner','Mere',current_date-2),
 (b,'Review collection permission and retention purpose','Noah',current_date-1),
 (c,'Agree extraction mapping before activation','Ana',current_date+3);
 insert into audit_events(entity_id,action,operator,reason,evidence_ref,after_value) values(a,'demo-seed','Demo operator','Fictional demonstration','fictional:seed','{"fictional":true}');
end $$;
