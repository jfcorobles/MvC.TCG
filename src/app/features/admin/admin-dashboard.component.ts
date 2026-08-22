import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { CardService } from '../../application/services/card.service';
import { ReportsService } from '../../application/services/reports.service';
import { CommunityService } from '../../application/services/community.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Card, Report, ReportStatus, UserProfile, UserRole, GameEvent, CardRuling, Poll } from '../../domain/models';

type AdminSidebarSection = 'resumen' | 'usuarios' | 'reportes' | 'eventos' | 'rulings' | 'encuestas';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit {
  readonly cardService = inject(CardService);
  readonly reportsService = inject(ReportsService);
  readonly communityService = inject(CommunityService);
  readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  // Active Sidebar Section
  readonly activeSection = signal<AdminSidebarSection>('resumen');

  // Users State
  readonly usersList = signal<UserProfile[]>([]);
  readonly isUsersLoading = signal<boolean>(false);
  readonly usersSearch = signal<string>('');

  // Toast Notification
  readonly toastMessage = signal<string | null>(null);

  // --- Form States for New Items ---
  
  // Event Form
  eventTitle = '';
  eventDesc = '';
  eventState = 'Ciudad de México';
  eventVenue = '';
  eventAddress = '';
  eventDate = '';
  eventFee = 'Gratuito';
  eventUrl = '';
  eventIsOfficial = true;
  isSavingEvent = signal<boolean>(false);

  // Ruling Form
  rulingCardId = '';
  rulingText = '';
  isSavingRuling = signal<boolean>(false);

  // Poll Form
  pollQuestion = '';
  pollDesc = '';
  pollOption1 = '';
  pollOption2 = '';
  pollOption3 = '';
  pollOption4 = '';
  isSavingPoll = signal<boolean>(false);

  readonly mexicanStates: string[] = [
    'Ciudad de México',
    'Estado de México',
    'Jalisco',
    'Nuevo León',
    'Puebla',
    'Querétaro',
    'Guanajuato',
    'Veracruz',
    'Yucatán',
    'Coahuila',
    'Baja California',
    'Chihuahua',
    'San Luis Potosí',
    'Aguascalientes'
  ];

  // Computed: Stats
  readonly cardsWithEffectCount = computed(() => 
    this.cardService.allCards().filter(c => !!c.effect && c.effect.trim().length > 0).length
  );

  readonly pendingReportsCount = computed(() =>
    this.reportsService.reports().filter(r => r.status === 'pendiente' || r.status === 'en_revision').length
  );

  // Computed: Filtered Users
  readonly filteredUsers = computed(() => {
    const list = this.usersList();
    const query = this.usersSearch().trim().toLowerCase();
    if (!query) return list;
    return list.filter(u =>
      (u.full_name && u.full_name.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.state_location && u.state_location.toLowerCase().includes(query)) ||
      u.role.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.loadUsers();
    this.reportsService.loadReports();
    this.communityService.loadEvents();
    this.communityService.loadAllRulings();
    this.communityService.loadActivePolls();
  }

  setSection(section: AdminSidebarSection): void {
    this.activeSection.set(section);
    if (section === 'usuarios' && this.usersList().length === 0) {
      this.loadUsers();
    }
  }

  async loadUsers(): Promise<void> {
    this.isUsersLoading.set(true);
    try {
      const profiles = await this.supabase.getAllProfiles();
      this.usersList.set(profiles);
    } catch (err) {
      console.warn('Could not load users profiles table:', err);
    } finally {
      this.isUsersLoading.set(false);
    }
  }

  async changeUserRole(user: UserProfile, newRole: UserRole): Promise<void> {
    if (user.role === newRole) return;

    const confirm = window.confirm(`¿Cambiar el rol de ${user.full_name || user.email} a "${newRole.toUpperCase()}"?`);
    if (!confirm) return;

    try {
      await this.supabase.updateUserRole(user.id, newRole);
      this.usersList.update(list =>
        list.map(u => u.id === user.id ? { ...u, role: newRole } : u)
      );
      this.showToast(`Rol de ${user.email} actualizado a ${newRole}.`);
    } catch (err: any) {
      alert('Error al actualizar el rol: ' + err.message);
    }
  }

  async updateReportStatus(report: Report, newStatus: ReportStatus): Promise<void> {
    try {
      await this.reportsService.updateReport(report.id, { status: newStatus });
      this.showToast(`Estado del reporte actualizado a ${newStatus}.`);
    } catch (err: any) {
      alert('Error al actualizar el reporte: ' + err.message);
    }
  }

  async deleteReport(report: Report): Promise<void> {
    const confirm = window.confirm(`¿Eliminar reporte "${report.title}"?`);
    if (!confirm) return;

    try {
      await this.reportsService.deleteReport(report.id);
      this.showToast('Reporte eliminado.');
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  }

  // --- Events Manager ---

  async saveEvent(): Promise<void> {
    if (!this.eventTitle.trim() || !this.eventDate) {
      alert('El evento debe tener título y fecha.');
      return;
    }

    this.isSavingEvent.set(true);
    try {
      await this.communityService.createEvent({
        title: this.eventTitle,
        description: this.eventDesc,
        stateLocation: this.eventState,
        venueName: this.eventVenue,
        address: this.eventAddress,
        eventDate: new Date(this.eventDate).toISOString(),
        entryFee: this.eventFee,
        registrationUrl: this.eventUrl,
        isOfficial: this.eventIsOfficial
      });

      this.eventTitle = '';
      this.eventDesc = '';
      this.eventVenue = '';
      this.eventAddress = '';
      this.eventDate = '';
      this.eventUrl = '';
      this.showToast('¡Torneo / Evento publicado con éxito!');
    } catch (err: any) {
      alert('Error al crear evento: ' + (err.message || err));
    } finally {
      this.isSavingEvent.set(false);
    }
  }

  async deleteEvent(event: GameEvent): Promise<void> {
    if (confirm(`¿Eliminar el evento "${event.title}"?`)) {
      await this.communityService.deleteEvent(event.id);
      this.showToast('Evento eliminado.');
    }
  }

  // --- Rulings Manager ---

  async saveRuling(): Promise<void> {
    if (!this.rulingCardId || !this.rulingText.trim()) {
      alert('Selecciona una carta y escribe el texto de la aclaración.');
      return;
    }

    this.isSavingRuling.set(true);
    try {
      await this.communityService.createRuling(this.rulingCardId, this.rulingText);
      this.rulingText = '';
      this.showToast('¡Ruling oficial registrado con éxito!');
    } catch (err: any) {
      alert('Error al crear ruling: ' + (err.message || err));
    } finally {
      this.isSavingRuling.set(false);
    }
  }

  async deleteRuling(ruling: CardRuling): Promise<void> {
    if (confirm(`¿Eliminar este ruling oficial?`)) {
      await this.communityService.deleteRuling(ruling.id);
      this.showToast('Ruling eliminado.');
    }
  }

  // --- Polls Manager ---

  async savePoll(): Promise<void> {
    if (!this.pollQuestion.trim()) {
      alert('La encuesta debe tener una pregunta.');
      return;
    }

    const options = [this.pollOption1, this.pollOption2, this.pollOption3, this.pollOption4]
      .map(o => o.trim())
      .filter(Boolean);

    if (options.length < 2) {
      alert('Debes ingresar al menos 2 opciones de respuesta.');
      return;
    }

    this.isSavingPoll.set(true);
    try {
      await this.communityService.createPoll(this.pollQuestion, this.pollDesc, options);
      this.pollQuestion = '';
      this.pollDesc = '';
      this.pollOption1 = '';
      this.pollOption2 = '';
      this.pollOption3 = '';
      this.pollOption4 = '';
      this.showToast('¡Encuesta comunitaria publicada con éxito!');
    } catch (err: any) {
      alert('Error al crear encuesta: ' + (err.message || err));
    } finally {
      this.isSavingPoll.set(false);
    }
  }

  async togglePoll(poll: Poll): Promise<void> {
    await this.communityService.togglePollActive(poll.id, !poll.isActive);
    this.showToast(`Encuesta ${!poll.isActive ? 'abierta' : 'cerrada'}.`);
  }

  async deletePoll(poll: Poll): Promise<void> {
    if (confirm(`¿Eliminar la encuesta "${poll.question}"?`)) {
      await this.communityService.deletePoll(poll.id);
      this.showToast('Encuesta eliminada.');
    }
  }

  goToCardBrowser(): void {
    this.router.navigate(['/cartas']);
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }

  private showToast(msg: string): void {
    this.toastMessage.set(msg);
    setTimeout(() => this.toastMessage.set(null), 4000);
  }
}
