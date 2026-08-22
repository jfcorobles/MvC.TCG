import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ReportsService } from '../../application/services/reports.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Report, ReportCategory, ReportSeverity, ReportStatus } from '../../domain/models';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent implements OnInit {
  readonly reportsService = inject(ReportsService);
  readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);

  readonly isModalOpen = signal<boolean>(false);
  readonly successToast = signal<string | null>(null);

  readonly categories: { value: ReportCategory; label: string }[] = [
    { value: 'reglas', label: 'Duda de Reglas / Interacción' },
    { value: 'carta_errata', label: 'Errata o Corrección de Carta' },
    { value: 'bug_app', label: 'Bug o Error en la Plataforma' },
    { value: 'sugerencia', label: 'Sugerencia de Mejora' },
    { value: 'torneo', label: 'Incidencia en Torneo / Partida' },
    { value: 'otro', label: 'Otro' },
  ];

  readonly severities: { value: ReportSeverity; label: string }[] = [
    { value: 'baja', label: 'Baja' },
    { value: 'media', label: 'Media' },
    { value: 'alta', label: 'Alta' },
    { value: 'critica', label: 'Crítica' },
  ];

  readonly reportForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(100)]],
    category: ['reglas' as ReportCategory, [Validators.required]],
    severity: ['media' as ReportSeverity, [Validators.required]],
    card_related: [''],
    description: ['', [Validators.required, Validators.minLength(15), Validators.maxLength(1000)]]
  });

  ngOnInit(): void {
    this.reportsService.loadReports();
  }

  openNewReportModal(): void {
    this.reportForm.reset({
      title: '',
      category: 'reglas',
      severity: 'media',
      card_related: '',
      description: ''
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  async submitReport(): Promise<void> {
    if (this.reportForm.invalid) {
      this.reportForm.markAllAsTouched();
      return;
    }

    try {
      await this.reportsService.createReport(this.reportForm.value);
      this.closeModal();
      this.showToast('¡Reporte registrado exitosamente en Supabase con RLS!');
    } catch (err) {
      console.error('Error submitting report:', err);
    }
  }

  async deleteReport(report: Report): Promise<void> {
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas eliminar el reporte "${report.title}"?`);
    if (!confirmDelete) return;

    try {
      await this.reportsService.deleteReport(report.id);
      this.showToast('Reporte eliminado correctamente.');
    } catch (err) {
      console.error('Error deleting report:', err);
    }
  }

  getCategoryLabel(category: ReportCategory): string {
    const found = this.categories.find(c => c.value === category);
    return found ? found.label : category;
  }

  getStatusBadgeClass(status: ReportStatus): string {
    switch (status) {
      case 'pendiente': return 'badge-warning';
      case 'en_revision': return 'badge-info';
      case 'resuelto': return 'badge-success';
      case 'descartado': return 'badge-muted';
      default: return 'badge-muted';
    }
  }

  getStatusLabel(status: ReportStatus): string {
    switch (status) {
      case 'pendiente': return 'Pendiente';
      case 'en_revision': return 'En Revisión';
      case 'resuelto': return 'Resuelto';
      case 'descartado': return 'Descartado';
      default: return status;
    }
  }

  private showToast(message: string): void {
    this.successToast.set(message);
    setTimeout(() => {
      this.successToast.set(null);
    }, 4000);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.reportForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
