export interface InteractionContext {
  playing: boolean;
  dialogOpen: boolean;
  panelsOpen: boolean;
  mateMenuOpen: boolean;
  editable: boolean;
  buttonFocused?: boolean;
}

/** Выбирает команды окон до игровых клавиш и защищает ввод текста от действий персонажа. */

export class InteractionInput {
  action(code: string, context: InteractionContext, composing = false): string | undefined {
    if (!context.playing) return;

    if (code === 'Escape') return context.panelsOpen ? 'close-panels' : 'release-cursor';

    if (context.editable)
      return code === 'Enter' && context.mateMenuOpen && !composing ? 'mate-send' : undefined;

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
