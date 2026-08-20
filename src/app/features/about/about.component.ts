import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardService } from '../../application/services/card.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css'
})
export class AboutComponent {
  readonly cardService = inject(CardService);
}
