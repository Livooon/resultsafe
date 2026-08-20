export type EntityType =
  | 'document'
  | 'requirement'
  | 'decision'
  | 'finding'
  | 'risk'
  | 'contract'
  | 'projection'
  | 'package_family'
  | 'standard'
  | 'migration'
  | 'integration'
  | 'scenario'
  | 'evidence'
  | 'work'
  | 'step'
  | 'task'
  | 'validation_run';

export interface CanonicalDocument {
  readonly document_id: string;
  readonly document_ref: string;
  readonly document_key: string;
  readonly document_type: string;
  readonly schema_ref: string;
  readonly payload: Record<string, unknown>;
  readonly source_path: string;
}

export interface CatalogRecord {
  readonly record_id: string;
  readonly record_ref: string;
  readonly record_key: string;
  readonly kind: Exclude<EntityType, 'document' | 'integration' | 'scenario' | 'evidence' | 'work' | 'step' | 'task' | 'validation_run'>;
  readonly code?: string;
  readonly scenario_refs?: readonly string[];
  readonly requirement_refs?: readonly string[];
  readonly evidence_refs?: readonly string[];
  readonly typescript_source?: string;
}

export interface Scenario {
  readonly scenario_id: string;
  readonly scenario_ref: string;
  readonly scenario_key: string;
  readonly code: string;
  readonly status: string;
  readonly subject_ref: string;
  readonly requirement_refs: readonly string[];
  readonly category: 'RUNTIME' | 'COMPILE' | 'ASYNC' | 'PACKAGE';
  readonly execution: RuntimeExecution | CompileExecution;
  readonly assertions: readonly ScenarioAssertion[];
  readonly execution_evidence?: { readonly diagnostics?: readonly string[] };
}

export interface RuntimeExecution {
  readonly kind: 'RUNTIME';
  readonly imports: readonly { readonly module: string; readonly names: readonly string[] }[];
  readonly fixture_source: string;
  readonly invocation: string;
  readonly capture: 'RETURN_OR_THROW' | 'AWAIT_RETURN_OR_REJECT';
}

export interface CompileExecution {
  readonly kind: 'COMPILE';
  readonly compiler: { readonly strict: true; readonly no_emit: true; readonly module_resolution: 'NodeNext' };
  readonly source: string;
}

export interface ScenarioAssertion {
  readonly operator: string;
  readonly actual?: string;
  readonly expected?: string;
}

export interface Entity {
  readonly id: string;
  readonly ref: string;
  readonly key: string;
  readonly type: EntityType;
  readonly code?: string;
  readonly value: Record<string, unknown>;
  readonly source_path: string;
}

export interface SchemaDocument {
  readonly key: string;
  readonly ref: string;
  readonly path: string;
  readonly value: Record<string, unknown>;
}

export interface Allocation {
  readonly key: string;
  readonly entityId: string;
}

export interface Corpus {
  readonly root: string;
  readonly documents: ReadonlyMap<string, CanonicalDocument>;
  readonly schemas: readonly SchemaDocument[];
  readonly records: ReadonlyMap<string, CatalogRecord>;
  readonly scenarios: ReadonlyMap<string, Scenario>;
  readonly entities: ReadonlyMap<string, Entity>;
  readonly allocations: readonly Allocation[];
}
