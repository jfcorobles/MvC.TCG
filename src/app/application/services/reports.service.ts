import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { 
  Report, 
  CreateReportDto, 
  UpdateReportDto, 
  ReportCategory, 
  ReportStatus 
} from '../../domain/models';

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private readonly supabase = inject(SupabaseService);

  // State Signals
  readonly reports = signal<Report[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // Filter Signals
  readonly selectedCategory = signal<ReportCategory | 'todas'>('todas');
  readonly selectedStatus = signal<ReportStatus | 'todos'>('todos');
  readonly searchQuery = signal<string>('');

  // Computed: Filtered Reports
  readonly filteredReports = computed(() => {
    let list = this.reports();
    const cat = this.selectedCategory();
    const stat = this.selectedStatus();
    const query = this.searchQuery().trim().toLowerCase();

    if (cat !== 'todas') {
      list = list.filter(r => r.category === cat);
    }

    if (stat !== 'todos') {
      list = list.filter(r => r.status === stat);
    }

    if (query) {
      list = list.filter(r => 
        r.title.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query) ||
        (r.card_related && r.card_related.toLowerCase().includes(query))
      );
    }

    return list;
  });

  // Computed: Dashboard Summary Metrics
  readonly metrics = computed(() => {
    const list = this.reports();
    return {
      total: list.length,
      pendientes: list.filter(r => r.status === 'pendiente').length,
      enRevision: list.filter(r => r.status === 'en_revision').length,
      resueltos: list.filter(r => r.status === 'resuelto').length,
      descartados: list.filter(r => r.status === 'descartado').length,
    };
  });

  /**
   * Cargar reportes aplicando Row Level Security (RLS) en Supabase
   */
  async loadReports(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase.client
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.reports.set((data as Report[]) || []);
    } catch (err: any) {
      console.error('Error fetching reports from Supabase:', err);
      this.error.set(err.message || 'Error al cargar los reportes');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Crear un nuevo reporte vinculado al auth.uid() del usuario actual
   */
  async createReport(dto: CreateReportDto): Promise<Report> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      const userId = this.supabase.userId();
      if (!userId) throw new Error('No hay una sesión activa de usuario');

      const newRecord = {
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        severity: dto.severity || 'media',
        card_related: dto.card_related?.trim() || null,
        user_id: userId,
        status: 'pendiente' as ReportStatus,
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase.client
        .from('reports')
        .insert(newRecord)
        .select()
        .single();

      if (error) throw error;

      const created = data as Report;
      // Actualizar estado local inmediatamente
      this.reports.update(current => [created, ...current]);
      return created;
    } catch (err: any) {
      console.error('Error creating report:', err);
      this.error.set(err.message || 'Error al crear el reporte');
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Actualizar reporte existente
   */
  async updateReport(id: string, dto: UpdateReportDto): Promise<Report> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      const updates = {
        ...dto,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase.client
        .from('reports')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updated = data as Report;
      this.reports.update(current => 
        current.map(r => r.id === id ? { ...r, ...updated } : r)
      );
      return updated;
    } catch (err: any) {
      console.error('Error updating report:', err);
      this.error.set(err.message || 'Error al actualizar el reporte');
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Eliminar reporte
   */
  async deleteReport(id: string): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      const { error } = await this.supabase.client
        .from('reports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.reports.update(current => current.filter(r => r.id !== id));
    } catch (err: any) {
      console.error('Error deleting report:', err);
      this.error.set(err.message || 'Error al eliminar el reporte');
      throw err;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  setCategoryFilter(category: ReportCategory | 'todas'): void {
    this.selectedCategory.set(category);
  }

  setStatusFilter(status: ReportStatus | 'todos'): void {
    this.selectedStatus.set(status);
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  resetFilters(): void {
    this.selectedCategory.set('todas');
    this.selectedStatus.set('todos');
    this.searchQuery.set('');
  }
}
