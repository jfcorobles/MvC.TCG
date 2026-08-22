import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CommunityService } from '../../application/services/community.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { GameEvent } from '../../domain/models';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './events.component.html',
  styleUrl: './events.component.css'
})
export class EventsComponent implements OnInit {
  readonly communityService = inject(CommunityService);
  readonly supabase = inject(SupabaseService);

  readonly selectedState = signal<string>('Todos');

  readonly mexicanStates: string[] = [
    'Todos',
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

  async ngOnInit(): Promise<void> {
    const userProfile = this.supabase.userProfile();
    if (userProfile?.state_location && this.mexicanStates.includes(userProfile.state_location)) {
      this.selectedState.set(userProfile.state_location);
      await this.communityService.loadEvents(userProfile.state_location);
    } else {
      await this.communityService.loadEvents();
    }
  }

  async filterByState(state: string): Promise<void> {
    this.selectedState.set(state);
    await this.communityService.loadEvents(state === 'Todos' ? undefined : state);
  }
}
