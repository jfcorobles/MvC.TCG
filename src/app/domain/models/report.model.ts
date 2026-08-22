export type ReportCategory = 
  | 'reglas' 
  | 'carta_errata' 
  | 'bug_app' 
  | 'sugerencia' 
  | 'torneo'
  | 'otro';

export type ReportStatus = 
  | 'pendiente' 
  | 'en_revision' 
  | 'resuelto' 
  | 'descartado';

export type ReportSeverity = 
  | 'baja' 
  | 'media' 
  | 'alta' 
  | 'critica';

export interface Report {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: ReportCategory;
  status: ReportStatus;
  severity: ReportSeverity;
  card_related?: string | null;
  created_at: string;
  updated_at?: string;
  user_email?: string;
}

export interface CreateReportDto {
  title: string;
  description: string;
  category: ReportCategory;
  severity?: ReportSeverity;
  card_related?: string | null;
}

export interface UpdateReportDto {
  title?: string;
  description?: string;
  category?: ReportCategory;
  status?: ReportStatus;
  severity?: ReportSeverity;
  card_related?: string | null;
}
