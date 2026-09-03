import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastStore } from '../core/toast.store';
import { Nav } from '../core/nav';

@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toasts.html',
})
export class Toasts {
  protected readonly toasts = inject(ToastStore);
  protected readonly nav = inject(Nav);
}
