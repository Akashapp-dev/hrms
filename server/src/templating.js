// Very simple mustache-like templating: replaces {{var}} with values.
// Supports dot notation like user.name

export function renderTemplate(template, data) {
  if (!template) return '';
  const get = (obj, path) => {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ''), obj);
  };
  return template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, key) => {
    const value = get(data, key);
    return value == null ? '' : String(value);
  });
}

export function extractVariables(template) {
  const set = new Set();
  const re = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;
  let m;
  while ((m = re.exec(template))) {
    set.add(m[1]);
  }
  return Array.from(set);
}

