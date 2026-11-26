import baseline from '../../balance/v060-baseline.json' with { type: 'json' };
import overhaul from '../../balance/v060-overhaul.json' with { type: 'json' };

function applyOverrides(base, overrides) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? applyOverrides(base?.[key], value)
      : value;
  }
  return result;
}

export default applyOverrides(baseline, overhaul);
