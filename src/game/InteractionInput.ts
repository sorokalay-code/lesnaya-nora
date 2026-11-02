export interface InteractionContext {
  playing: boolean;
  dialogOpen: boolean;
  panelsOpen: boolean;
  mateMenuOpen: boolean;
  editable: boolean;
  buttonFocused?: boolean;
  confirmationOpen?: boolean;
}

/** Выбирает команды окон до игровых клавиш и защищает ввод текста от действий персонажа. */

export class InteractionInput {
  action(code: string, context: InteractionContext, composing = false): string | undefined {
    if (!context.playing) return;

    if (code === 'Escape')
      return context.confirmationOpen
        ? 'cancel-remove'
        : context.panelsOpen
          ? 'close-panels'
          : 'menu';

    if (context.confirmationOpen) return;
    if (!context.editable && (code === 'Backquote' || code === 'F1')) return 'menu';

    if (context.editable)
      return code === 'Enter' && context.mateMenuOpen && !composing ? 'mate-send' : undefined;

    if (code === 'KeyI') return 'status-panel';

    if (context.panelsOpen && code === 'KeyM') return 'map';

    if (context.panelsOpen && code === 'KeyJ') return 'journal';

    if (code === 'Tab' && !context.panelsOpen) return 'mate-panel';

    if (context.mateMenuOpen) {
      const commands: Record<string, string> = {
        Digit1: 'follow',
        Digit2: 'stay',
        Digit3: 'forage',
        Digit4: 'home',
        Numpad1: 'follow',
        Numpad2: 'stay',
        Numpad3: 'forage',
        Numpad4: 'home',
      };
      if (commands[code]) return `mate-command:${commands[code]}`;

      if (code === 'Enter' && !context.buttonFocused) return 'mate-focus';
    }

    if (context.dialogOpen && code === 'KeyE') return 'close-panels';
  }
}
