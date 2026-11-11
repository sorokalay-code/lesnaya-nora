export const GRAPHICS_LEVELS = {
  shadows: { off: 0, low: 512, medium: 1024, high: 2048 },
  textures: { low: 1, medium: 4, high: 8 },
  distance: {
    near: { chunks: 1, far: 150 },
    normal: { chunks: 2, far: 240 },
    far: { chunks: 3, far: 350 },
  },
  details: { off: 0, reduced: 0.45, full: 1 },
  resolution: { low: 0.6, medium: 0.85, full: 1 },
} as const;

export type GraphicsSettings = {
  readonly [K in keyof typeof GRAPHICS_LEVELS]: keyof (typeof GRAPHICS_LEVELS)[K];
};

export const GRAPHICS_PRESETS = {
  performance: {
    shadows: 'off',
    textures: 'low',
    distance: 'near',
    details: 'reduced',
    resolution: 'low',
  },
  balanced: {
    shadows: 'medium',
    textures: 'medium',
    distance: 'normal',
    details: 'full',
    resolution: 'full',
  },
  quality: {
    shadows: 'high',
    textures: 'high',
    distance: 'far',
    details: 'full',
    resolution: 'full',
  },
} as const satisfies Record<string, GraphicsSettings>;

export type GraphicsPreset = keyof typeof GRAPHICS_PRESETS;

function isKey<T extends object>(choices: T, value: unknown): value is keyof T {
  return typeof value === 'string' && Object.hasOwn(choices, value);
}

function validate(value: unknown, fallback: GraphicsSettings): GraphicsSettings {
  if (!value || typeof value !== 'object') return fallback;
  const raw: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  return {
    shadows: isKey(GRAPHICS_LEVELS.shadows, raw.shadows) ? raw.shadows : fallback.shadows,
    textures: isKey(GRAPHICS_LEVELS.textures, raw.textures) ? raw.textures : fallback.textures,
    distance: isKey(GRAPHICS_LEVELS.distance, raw.distance) ? raw.distance : fallback.distance,
    details: isKey(GRAPHICS_LEVELS.details, raw.details) ? raw.details : fallback.details,
    resolution: isKey(GRAPHICS_LEVELS.resolution, raw.resolution)
      ? raw.resolution
      : fallback.resolution,
  };
}

export function graphicsPreset(settings: GraphicsSettings): GraphicsPreset | undefined {
  return (['performance', 'balanced', 'quality'] as const).find((name) => {
    const preset = GRAPHICS_PRESETS[name];
    return (
      preset.shadows === settings.shadows &&
      preset.textures === settings.textures &&
      preset.distance === settings.distance &&
      preset.details === settings.details &&
      preset.resolution === settings.resolution
    );
  });
}

const STORAGE_KEY = 'lesnaya-nora-graphics';

/** Хранит настройки устройства отдельно от сохранений и проверяет команды интерфейса. */
export class GraphicsPreferences {
  private current: GraphicsSettings;
  private readonly defaults: GraphicsSettings;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    mobile: boolean,
  ) {
    this.defaults = mobile
      ? { ...GRAPHICS_PRESETS.balanced, shadows: 'low', details: 'reduced', resolution: 'medium' }
      : GRAPHICS_PRESETS.balanced;
    this.current = this.defaults;
    try {
      this.current = validate(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'), this.defaults);
    } catch {
      // Недоступное хранилище не мешает играть с настройками текущей вкладки.
    }
  }

  get settings(): GraphicsSettings {
    return this.current;
  }

  change(field: string, value: unknown): GraphicsSettings | undefined {
    if (field === 'reset') this.current = this.defaults;
    else if (field === 'preset' && isKey(GRAPHICS_PRESETS, value))
      this.current = GRAPHICS_PRESETS[value];
    else if (isKey(GRAPHICS_LEVELS, field) && isKey(GRAPHICS_LEVELS[field], value))
      this.current = validate({ ...this.current, [field]: value }, this.current);
    else return;

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      // Изменение уже действует в текущей вкладке.
    }
    return this.current;
  }
}
