import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, shortWeekday, today } from '../../core/dates';
import type { Category, Task } from '../../core/models';
import { Swipe } from '../../shared/swipe';
import {
  makeCarriedTask,
  makeCategory,
  makeDoneTask,
  makeTask,
  resetIds,
} from '../../../testing/fakes';
import { render } from '../../../testing/render';
import { TaskRow } from './task-row';

/**
 * The row is the app's primary surface, and most of what matters about it is
 * what it does *not* do on a finished task: it does not fade, it does not
 * offer a gesture, and it does not drop the carried count.
 */

const NO_CATEGORIES = new Map<string, Category>();

function renderRow(task: Task, categories = NO_CATEGORIES) {
  return render(TaskRow, { inputs: { task, categories } });
}

/** The directive instance the row wired its gestures to. */
function swipeOn(fixture: ComponentFixture<unknown>): Swipe {
  return fixture.debugElement.query(By.directive(Swipe)).injector.get(Swipe);
}

/**
 * Anything dimming a whole element, by inline style or by an `opacity-*`
 * utility. There is no stylesheet in jsdom, so a computed opacity would read
 * 1 whatever the markup said and the test could never fail. This reads the
 * fade *mechanism* rather than a colour, which is why it is the one place a
 * class name is looked at.
 */
function fadedNodes(el: HTMLElement): HTMLElement[] {
  return [el, ...el.querySelectorAll<HTMLElement>('*')].filter(
    (node) => node.style.opacity !== '' || [...node.classList].some((c) => /(^|:)opacity-/.test(c)),
  );
}

describe('TaskRow', () => {
  beforeEach(() => {
    resetIds();
    // The task text is a routerLink, so the row needs a Router to render at
    // all. Configured here rather than through `render`, whose `providers`
    // takes component providers only.
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders the task text', async () => {
    const { el } = await renderRow(makeTask({ text: 'call physio' }));
    expect(el.textContent).toContain('call physio');
  });

  it('names the checkbox by what pressing it will do', async () => {
    const { query } = await renderRow(makeTask());
    expect(query('button')?.getAttribute('aria-label')).toBe('Mark as done');
  });

  it('reports the finished state through aria-pressed, not through colour alone', async () => {
    const open = await renderRow(makeTask());
    expect(open.query('button')?.getAttribute('aria-pressed')).toBe('false');

    const done = await renderRow(makeDoneTask());
    expect(done.query('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(done.query('button')?.getAttribute('aria-label')).toBe('Mark as not done');
  });

  it('does not fade a completed row', async () => {
    const { el } = await renderRow(makeDoneTask());
    expect(fadedNodes(el).map((n) => n.tagName)).toEqual([]);
  });

  it('does not render the swipe action layer on a finished row', async () => {
    const open = await renderRow(makeTask());
    const done = await renderRow(makeDoneTask());

    // The wrapper holds the action layer and the row that slides over it.
    expect(open.el.firstElementChild?.children.length).toBe(2);
    expect(done.el.firstElementChild?.children.length).toBe(1);
  });

  it('labels the two swipe actions on a row that still has them', async () => {
    const { el } = await renderRow(makeTask({ scheduled_date: today() }));
    const layer = el.firstElementChild?.children[0];
    expect(layer?.textContent).toContain('Done');
    expect(layer?.textContent).toContain('Tomorrow');
  });

  it('hides the swipe action layer from assistive tech, since the labels are decoration', async () => {
    const { el } = await renderRow(makeTask());
    expect(el.firstElementChild?.children[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('disables the gesture on a finished row', async () => {
    const open = await renderRow(makeTask());
    expect(swipeOn(open.fixture).disabled()).toBe(false);

    const done = await renderRow(makeDoneTask());
    expect(swipeOn(done.fixture).disabled()).toBe(true);
  });

  it('completes on a right swipe', async () => {
    const { fixture, component, settle } = await renderRow(makeTask());
    const toggled = vi.fn();
    component.toggled.subscribe(toggled);

    swipeOn(fixture).swiped.emit('right');
    await settle();

    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it('reschedules on a left swipe', async () => {
    const { fixture, component, settle } = await renderRow(makeTask());
    const pushed = vi.fn();
    component.pushed.subscribe(pushed);

    swipeOn(fixture).swiped.emit('left');
    await settle();

    expect(pushed).toHaveBeenCalledTimes(1);
  });

  it('never pushes a finished task, because completion pins the day it was done', async () => {
    const { fixture, component, settle } = await renderRow(makeDoneTask());
    const pushed = vi.fn();
    component.pushed.subscribe(pushed);

    swipeOn(fixture).swiped.emit('left');
    await settle();

    expect(pushed).not.toHaveBeenCalled();
  });

  it('keeps the carried badge after the task is done', async () => {
    const carried = makeCarriedTask(3);
    const open = await renderRow(carried);
    expect(open.byText('span', 'carried ×3')).not.toBeNull();

    const done = await renderRow(makeDoneTask({ carried_over_count: 3 }));
    expect(done.byText('span', 'carried ×3')).not.toBeNull();
  });

  it('reads the carried count in the past tense once the task is done', async () => {
    const open = await renderRow(makeCarriedTask(3));
    expect(open.byText('span', 'carried ×3')?.getAttribute('title')).toBe('Rolled over 3 times');

    const done = await renderRow(makeDoneTask({ carried_over_count: 3 }));
    expect(done.byText('span', 'carried ×3')?.getAttribute('title')).toBe(
      'Rolled over 3 times before it was done',
    );
  });

  it('says nothing about carrying when the task has never rolled over', async () => {
    const { byText } = await renderRow(makeTask({ carried_over_count: 0 }));
    expect(byText('span', 'carried')).toBeNull();
  });

  it('shows the completion time on a finished row', async () => {
    const { el } = await renderRow(makeDoneTask());
    expect(el.textContent).toMatch(/done \d/);
  });

  it('shows the category name when the map knows it', async () => {
    const category = makeCategory({ name: 'Health' });
    const { el } = await renderRow(
      makeTask({ category_id: category.id }),
      new Map([[category.id, category]]),
    );
    expect(el.textContent).toContain('Health');
  });

  it('renders no category chip when the id is not in the map', async () => {
    const { el } = await renderRow(makeTask({ category_id: 'category-gone' }));
    expect(el.textContent).not.toContain('category-gone');
  });

  it('renders the energy the task carries', async () => {
    const { byText } = await renderRow(makeTask({ energy: 'deep' }));
    expect(byText('span', 'deep')).not.toBeNull();
  });

  describe('the push button', () => {
    it('names tomorrow when the task is on today', async () => {
      const { byText } = await renderRow(makeTask({ scheduled_date: today() }));
      const push = byText('button', 'Tomorrow');
      expect(push?.getAttribute('aria-label')).toBe('Move to Tomorrow');
    });

    it('names the day it actually lands on for a task further out', async () => {
      const scheduled = addDays(today(), 5);
      const landing = addDays(scheduled, 1);
      const { queryAll } = await renderRow(makeTask({ scheduled_date: scheduled }));

      const push = queryAll('button').find((b) =>
        (b.getAttribute('aria-label') ?? '').startsWith('Move to'),
      );
      expect(push?.textContent?.trim()).toContain(shortWeekday(landing));
      expect(push?.getAttribute('aria-label')).not.toBe('Move to Tomorrow');
    });

    it('is not offered on a finished row', async () => {
      const { queryAll } = await renderRow(makeDoneTask());
      const labels = queryAll('button').map((b) => b.getAttribute('aria-label'));
      expect(labels.filter((l) => l?.startsWith('Move to'))).toEqual([]);
    });

    it('emits pushed when pressed', async () => {
      const { component, click, byText, settle } = await renderRow(
        makeTask({ scheduled_date: today() }),
      );
      const pushed = vi.fn();
      component.pushed.subscribe(pushed);

      const button = byText('button', 'Tomorrow');
      expect(button).not.toBeNull();
      await click(button as HTMLElement);
      await settle();

      expect(pushed).toHaveBeenCalledTimes(1);
    });
  });

  it('emits toggled when the checkbox is pressed', async () => {
    const { component, click } = await renderRow(makeTask());
    const toggled = vi.fn();
    component.toggled.subscribe(toggled);

    await click('button');

    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it('carries a view-transition-name derived from the task id', async () => {
    const task = makeTask();
    const { el } = await renderRow(task);
    expect(el.style.getPropertyValue('view-transition-name')).toBe(`task-${task.id}`);
  });
});

@Component({
  selector: 'app-two-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TaskRow],
  template: `
    @for (task of tasks(); track task.id) {
      <app-task-row [task]="task" [categories]="categories()" />
    }
  `,
})
class TwoRows {
  readonly tasks = input.required<Task[]>();
  readonly categories = input(NO_CATEGORIES);
}

describe('TaskRow in a list', () => {
  beforeEach(() => {
    resetIds();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('gives every live row a view-transition-name of its own, or the morph dies', async () => {
    const tasks = [makeTask({ text: 'one' }), makeTask({ text: 'two' })];
    const { queryAll } = await render(TwoRows, { inputs: { tasks } });

    const names = queryAll('app-task-row').map((row) =>
      row.style.getPropertyValue('view-transition-name'),
    );

    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });
});
