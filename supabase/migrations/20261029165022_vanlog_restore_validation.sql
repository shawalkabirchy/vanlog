do $$
declare definition text;
begin
  select pg_get_functiondef('public.vanlog_restore(jsonb,boolean)'::regprocedure) into definition;
  definition:=replace(definition, 'p_backup->>''appId''<>''P07'' or p_backup->>''formatVersion''<>''1''', 'p_backup->>''appId'' is distinct from ''P07'' or p_backup->>''formatVersion'' is distinct from ''1''');
  definition:=replace(definition, 'payload:=p_backup->''payload'';', E'payload:=p_backup->''payload'';\n  if jsonb_typeof(payload) is distinct from ''object'' or jsonb_typeof(payload->''accounts'') is distinct from ''array'' or jsonb_typeof(payload->''equipment'') is distinct from ''array'' or jsonb_typeof(payload->''tasks'') is distinct from ''array'' or jsonb_typeof(payload->''readings'') is distinct from ''array'' or jsonb_typeof(payload->''services'') is distinct from ''array'' then raise exception ''IMPORT_INVALID''; end if;');
  execute definition;
end $$;
