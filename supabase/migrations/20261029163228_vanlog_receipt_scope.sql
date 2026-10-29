do $$
declare definition text;
begin
  select pg_get_functiondef('public.vanlog_api(text,text,jsonb)'::regprocedure) into definition;
  if position('mutation_receipts.request_id=vanlog_api.request_id' in definition)=0 then raise exception 'Unexpected API definition'; end if;
  -- Read the key from the input to avoid the variable/column scope collision.
  execute replace(definition,'mutation_receipts.request_id=vanlog_api.request_id','mutation_receipts.request_id=(p_input->>''requestId'')::uuid');
end $$;
