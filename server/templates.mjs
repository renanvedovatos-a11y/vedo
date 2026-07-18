// Ferramenta de templates do assistente de voz — usa a biblioteca real
// (src/data/templates_video.json, 205 templates; crescerá para ~370).
import { biblioteca, selecionarTemplates } from "./temas.mjs";

export function sortearTemplates(quantidade = 5, ids = null) {
  return selecionarTemplates({ quantidade, ids });
}

export function totalTemplates() {
  try {
    return biblioteca().length;
  } catch {
    return 0;
  }
}
