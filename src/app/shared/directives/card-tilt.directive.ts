import { Directive, ElementRef, HostListener, Input, inject } from '@angular/core';

@Directive({
  selector: '[appCardTilt]',
  standalone: true
})
export class CardTiltDirective {
  private readonly el = inject(ElementRef);

  @Input() maxTilt = 15;
  @Input() perspective = 800;
  @Input() scale = 1.04;

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    const card = this.el.nativeElement as HTMLElement;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -this.maxTilt;
    const rotateY = ((x - centerX) / centerX) * this.maxTilt;

    card.style.transform = `perspective(${this.perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${this.scale}, ${this.scale}, ${this.scale})`;
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    const card = this.el.nativeElement as HTMLElement;
    card.style.transform = `perspective(${this.perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  }
}
