// Renderizador de markdown mínimo — só o subconjunto que o VEDO usa em
// roteiros e legendas (títulos, listas, negrito, código, links). Escrito à mão
// para não puxar dependência nova: o HTML é escapado ANTES de qualquer
// conversão, então nada que vier do modelo pode injetar marcação.

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Formatação dentro de uma linha (aplicada depois do escape).
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    // Só http(s): evita javascript: e afins vindos do texto do modelo.
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function paraHtml(md: string): string {
  const linhas = escapar(md).split("\n");
  const out: string[] = [];
  let lista: "ul" | "ol" | null = null;
  let emCodigo = false;

  const fecharLista = () => {
    if (lista) {
      out.push(`</${lista}>`);
      lista = null;
    }
  };

  for (const linha of linhas) {
    // Bloco de código cercado por ```
    if (/^\s*```/.test(linha)) {
      fecharLista();
      out.push(emCodigo ? "</code></pre>" : "<pre><code>");
      emCodigo = !emCodigo;
      continue;
    }
    if (emCodigo) {
      out.push(linha);
      continue;
    }

    if (!linha.trim()) {
      fecharLista();
      continue;
    }

    const titulo = linha.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      fecharLista();
      const nivel = Math.min(titulo[1].length + 2, 6); // # vira h3 (h1/h2 são da UI)
      out.push(`<h${nivel}>${inline(titulo[2])}</h${nivel}>`);
      continue;
    }

    const item = linha.match(/^\s*[-*+]\s+(.*)$/);
    if (item) {
      if (lista !== "ul") {
        fecharLista();
        out.push("<ul>");
        lista = "ul";
      }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }

    const numerado = linha.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numerado) {
      if (lista !== "ol") {
        fecharLista();
        out.push("<ol>");
        lista = "ol";
      }
      out.push(`<li>${inline(numerado[1])}</li>`);
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(linha)) {
      fecharLista();
      out.push("<hr />");
      continue;
    }

    fecharLista();
    out.push(`<p>${inline(linha)}</p>`);
  }

  fecharLista();
  if (emCodigo) out.push("</code></pre>");
  return out.join("\n");
}

export function Markdown({ texto }: { texto: string }) {
  return (
    <div className="md" dangerouslySetInnerHTML={{ __html: paraHtml(texto) }} />
  );
}
