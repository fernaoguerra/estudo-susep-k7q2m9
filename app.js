"use strict";

// ---------- estado (fica só neste aparelho) ----------
const CHAVE = "simcorretor:v1";
const LETRAS = ["a", "b", "c", "d", "e"];
const DATA_PROVA = new Date(2026, 11, 5); // 05/12/2026, 1º dia FGV

let D = null; // dados.json
let E = carregaEstado();

function carregaEstado() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (s && s.hist) return s;
  } catch (e) { /* estado corrompido: recomeça */ }
  return { hist: {}, provas: {}, sessoes: {}, pref: { detalheAberto: false } };
}
function salva() {
  try { localStorage.setItem(CHAVE, JSON.stringify(E)); } catch (e) { avisa("Não consegui salvar o progresso neste aparelho."); }
}

// ---------- utilidades ----------
const $ = (sel) => document.querySelector(sel);
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pct(a, b) { return b ? Math.round((100 * a) / b) : 0; }
function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }
function embaralha(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function diasAteProva() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((DATA_PROVA - hoje) / 86400000);
}
function avisa(txt, acao) {
  const el = $("#aviso");
  el.innerHTML = `<span>${esc(txt)}</span>` + (acao ? `<button type="button">${esc(acao.rotulo)}</button>` : "");
  el.hidden = false;
  if (acao) el.querySelector("button").onclick = acao.fn;
  clearTimeout(avisa.t);
  if (!acao) avisa.t = setTimeout(() => { el.hidden = true; }, 3500);
}
function aceitas(q) {
  // ambígua ou desatualizada pela lei nova: vale a letra revisada e a do gabarito original
  return (q.st === "ambigua" || q.st === "desatualizada") && q.gs !== q.g ? [q.g, q.gs] : [q.g];
}
function acertou(q, letra) { return aceitas(q).includes(letra); }

// ---------- sessões: prova do site, treino por disciplina, erradas ----------
function prova(id) { return D.provas.find((p) => p.id === id); }

function sessao(tipo, chave) {
  if (tipo === "p") {
    const p = prova(chave);
    if (!p) return null;
    E.provas[chave] = E.provas[chave] || { resp: {} };
    return { tipo, chave, base: `#/p/${chave}`, titulo: p.nome, ids: p.questoes, resp: E.provas[chave].resp, prova: p };
  }
  if (tipo === "t") {
    const k = "t:" + chave;
    if (!E.sessoes[k]) novaSessaoTreino(chave);
    const s = E.sessoes[k];
    const titulo = chave === "tudo" ? "Treino — tudo" : "Treino — " + (D.disciplinas[chave]?.nome || chave);
    return { tipo, chave, base: `#/t/${chave}`, titulo, ids: s.ids, resp: s.resp };
  }
  if (tipo === "e") {
    if (!E.sessoes.e) novaSessaoErradas();
    const s = E.sessoes.e;
    return { tipo, chave: "", base: "#/e", titulo: "Revisar erradas", ids: s.ids, resp: s.resp };
  }
  return null;
}

function idsDaDisciplina(chave) {
  return Object.keys(D.q).filter((id) => chave === "tudo" || D.q[id].d === chave);
}
function novaSessaoTreino(chave) {
  // nunca respondidas primeiro, depois as que errei, por último as que acertei
  const ids = idsDaDisciplina(chave);
  const novas = [], erradas = [], certas = [];
  for (const id of ids) {
    const h = E.hist[id];
    (!h ? novas : h.ok ? certas : erradas).push(id);
  }
  E.sessoes["t:" + chave] = { ids: [...embaralha(novas), ...embaralha(erradas), ...embaralha(certas)], resp: {} };
  salva();
}
function idsErrados() { return Object.keys(E.hist).filter((id) => D.q[id] && !E.hist[id].ok); }
function novaSessaoErradas() {
  E.sessoes.e = { ids: embaralha(idsErrados()), resp: {} };
  salva();
}

function responde(ses, id, letra) {
  if (ses.resp[id]) return;
  const q = D.q[id];
  const ok = acertou(q, letra);
  ses.resp[id] = letra;
  E.hist[id] = { r: letra, ok, t: Date.now(), n: (E.hist[id]?.n || 0) + 1 };
  salva();
}

function placar(ses, ids = ses.ids) {
  let feitas = 0, certas = 0;
  for (const id of ids) {
    const r = ses.resp[id];
    if (r) { feitas++; if (acertou(D.q[id], r)) certas++; }
  }
  return { feitas, certas, total: ids.length };
}
function primeiraPendente(ses) {
  const i = ses.ids.findIndex((id) => !ses.resp[id]);
  return i < 0 ? ses.ids.length : i + 1;
}

// ---------- telas ----------
function tela(html, info = "") {
  $("#tela").innerHTML = html;
  $("#topo-info").textContent = info;
  window.scrollTo(0, 0);
}

function telaInicio() {
  const dias = diasAteProva();
  const hist = Object.values(E.hist);
  const certas = hist.filter((h) => h.ok).length;
  const nErradas = idsErrados().length;

  const cards = D.provas.map((p) => {
    const ses = sessao("p", p.id);
    const pl = placar(ses);
    const terminou = pl.feitas === pl.total;
    const largOk = pct(pl.certas, pl.total), largNok = pct(pl.feitas - pl.certas, pl.total);
    const n = primeiraPendente(ses);
    const acao = pl.feitas === 0 ? "Começar" : terminou ? "Ver resultado" : "Continuar";
    const destino = terminou ? `${ses.base}/fim` : `${ses.base}/${n}`;
    return `
      <div class="cartao">
        <a class="cartao-link" href="${destino}">
          <div class="linha-topo"><h3>${esc(p.nome)}</h3><span class="mini">${esc(p.dia)} · ${pl.total} questões</span></div>
          <div class="mini">${p.disciplinas.map((d) => esc(d.nome)).join(" · ")}</div>
          <div class="barra dupla"><span class="ok" style="width:${largOk}%"></span><span class="nok" style="width:${largNok}%"></span></div>
          <div class="mini" style="margin-top:6px">${pl.feitas ? `${pl.feitas}/${pl.total} respondidas · ${plural(pl.certas, "certa", "certas")} (${pct(pl.certas, pl.feitas)}%)` : "Aprovação: 35 de 50, sem zerar disciplina"}</div>
        </a>
        <div class="botoes">
          <a class="btn primario" href="${destino}">${acao}</a>
          ${pl.feitas ? `<button class="btn" data-refazer="${p.id}">Refazer</button>` : ""}
        </div>
      </div>`;
  }).join("");

  tela(`
    <p class="contagem">${dias > 0 ? `Faltam <b>${dias} dias</b> para a prova (05/12)` : dias === 0 ? "<b>A prova é hoje.</b> Boa prova!" : "Prova de 2026.2 já passou"}</p>
    <p class="sub">${hist.length ? `${plural(hist.length, "questão respondida", "questões respondidas")} · ${pct(certas, hist.length)}% de acerto` : "As 4 provas do simulado, com gabarito revisado e o porquê de cada alternativa."}</p>
    <h2>Simulados</h2>
    ${cards}
    <h2>Estudar</h2>
    <div class="grade-atalhos">
      <a class="cartao cartao-link" href="#/t"><h3>Treino por disciplina</h3><div class="mini">${D.stats.banco} questões do banco</div></a>
      <a class="cartao cartao-link" href="#/e"><h3>Revisar erradas</h3><div class="mini">${nErradas ? `${nErradas} para revisar` : "Nenhuma por enquanto"}</div></a>
      <a class="cartao cartao-link" href="#/r"><h3>O que mais cai</h3><div class="mini">Resumo por disciplina</div></a>
      <a class="cartao cartao-link" href="#/sobre"><h3>Sobre a prova FGV</h3><div class="mini">Grade, regras e avisos</div></a>
    </div>
  `, "");

  document.querySelectorAll("[data-refazer]").forEach((b) => {
    b.onclick = () => {
      const p = prova(b.dataset.refazer);
      if (!confirm(`Apagar as respostas de ${p.nome} e começar de novo?`)) return;
      E.provas[p.id] = { resp: {} };
      salva();
      telaInicio();
    };
  });
}

function rotuloRecorrencia(rc) {
  if (!rc) return "";
  if (rc.nivel === "alta") return `<span class="chip quente">Cai sempre</span>`;
  if (rc.nivel === "media") return `<span class="chip">Já caiu mais de uma vez</span>`;
  return "";
}
function rotuloStatus(q) {
  if (q.st === "diverge") return `<span class="chip alerta">Gabarito corrigido</span>`;
  if (q.st === "desatualizada") return `<span class="chip alerta">Lei mudou</span>`;
  if (q.st === "ambigua") return `<span class="chip alerta">Ambígua</span>`;
  return "";
}

function telaQuestao(ses, n) {
  const total = ses.ids.length;
  if (!total) {
    return tela(`<p class="vazio">Nada aqui ainda. ${ses.tipo === "e" ? "Quando errar uma questão, ela aparece nesta lista." : ""}</p><div class="botoes"><a class="btn" href="#/">Voltar</a></div>`, ses.titulo);
  }
  if (n > total) return telaFim(ses);
  n = Math.max(1, n);
  const id = ses.ids[n - 1];
  const q = D.q[id];
  const disc = D.disciplinas[q.d];
  const resp = ses.resp[id];
  const pl = placar(ses);

  const alts = LETRAS.filter((l) => q.a[l] != null).map((l) => {
    let cls = "alt";
    if (resp) {
      if (aceitas(q).includes(l)) cls += " certa";
      else if (l === resp) cls += " errada";
      else cls += " apagada";
    }
    return `<button class="${cls}" data-l="${l}" ${resp ? "disabled" : ""}><span class="letra">${l}</span><span>${esc(q.a[l])}</span></button>`;
  }).join("");

  let retorno = "";
  if (resp) {
    const ok = acertou(q, resp);
    retorno = `
      <div class="retorno ${ok ? "ok" : "nok"}">
        <span>${!ok ? `✗ Errou — a certa é ${q.g.toUpperCase()}` : resp !== q.g ? `✓ Vale pelo gabarito original — ${q.st === "desatualizada" ? "pela lei de hoje" : "a melhor"} é ${q.g.toUpperCase()}` : "✓ Acertou"}</span>
        <button class="btn" id="ver-detalhe" aria-expanded="false">Ver detalhe</button>
      </div>
      <div class="detalhe" id="detalhe" hidden>${htmlDetalhe(q, resp)}</div>`;
  }

  tela(`
    <div class="q-cabeca">
      <span class="q-pos">Questão ${n} de ${total}</span>
      <span class="mini">${pl.certas}/${pl.feitas} certas</span>
    </div>
    <div class="barra"><span style="width:${pct(n, total)}%"></span></div>
    <div class="chips">
      <span class="chip neutro">${esc(disc?.nome || q.d)}</span>
      ${rotuloRecorrencia(q.rc)}
      ${resp ? rotuloStatus(q) : ""}
    </div>
    <p class="enunciado">${esc(q.p)}</p>
    <div class="alts">${alts}</div>
    ${retorno}
    <nav class="nav-q">
      <a class="btn" href="${ses.base}/${n - 1}" ${n <= 1 ? 'aria-disabled="true" style="visibility:hidden"' : ""}>← Anterior</a>
      <a class="btn mapa-btn" href="${ses.base}/mapa" aria-label="Mapa das questões">▦</a>
      <a class="btn ${resp ? "primario" : ""}" href="${ses.base}/${n + 1}">${n === total ? "Terminar" : resp ? "Próxima →" : "Pular →"}</a>
    </nav>
  `, ses.titulo);

  document.querySelectorAll(".alt[data-l]").forEach((b) => {
    b.onclick = () => {
      responde(ses, id, b.dataset.l);
      telaQuestao(ses, n);
      if (E.pref.detalheAberto) abreDetalhe();
      const r = document.querySelector(".retorno");
      if (r) r.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
  });
  const bd = $("#ver-detalhe");
  if (bd) {
    bd.onclick = () => ($("#detalhe").hidden ? abreDetalhe() : fechaDetalhe());
    if (E.pref.detalheAberto) abreDetalhe();
  }
  teclado = (ev) => {
    const k = ev.key.toLowerCase();
    if (!resp && LETRAS.includes(k) && q.a[k] != null) document.querySelector(`.alt[data-l="${k}"]`).click();
    else if (k === "arrowright" || (resp && k === "enter")) location.hash = `${ses.base}/${n + 1}`;
    else if (k === "arrowleft" && n > 1) location.hash = `${ses.base}/${n - 1}`;
    else if (resp && k === "d") bd.click();
  };
}
function abreDetalhe() {
  const d = $("#detalhe"), b = $("#ver-detalhe");
  if (!d) return;
  d.hidden = false; b.textContent = "Fechar detalhe"; b.setAttribute("aria-expanded", "true");
}
function fechaDetalhe() {
  const d = $("#detalhe"), b = $("#ver-detalhe");
  d.hidden = true; b.textContent = "Ver detalhe"; b.setAttribute("aria-expanded", "false");
}

function htmlDetalhe(q, resp) {
  const g = q.g;
  const partes = [];
  if (q.st === "confere" && q.nv) {
    partes.push(`<div class="bloco alerta"><h3>Observação sobre o enunciado</h3><p>${esc(q.nv)}</p></div>`);
  } else if (q.nv) {
    const titulo = q.st === "diverge" ? `Gabarito corrigido (o site marca ${q.gs.toUpperCase()})`
      : q.st === "desatualizada" ? "Atenção: a lei mudou depois desta questão"
      : "Questão ambígua";
    partes.push(`<div class="bloco alerta"><h3>${titulo}</h3><p>${esc(q.nv)}</p></div>`);
  }
  if (q.rev) {
    partes.push(`<div class="bloco"><h3>Por que ${g.toUpperCase()}</h3><p>${esc(q.pc)}</p></div>`);
    const outras = LETRAS.filter((l) => l !== g && q.a[l] != null).map((l) => `
      <li><span class="alt-txt">${l.toUpperCase()}) ${esc(q.a[l])}</span>${l === resp ? '<span class="tua">sua resposta</span>' : ""}
      <div>${esc(q.pe?.[l] || "")}</div></li>`).join("");
    partes.push(`<div class="bloco"><h3>Por que não as outras</h3><ul class="erradas-lista">${outras}</ul></div>`);
    if (q.ca) partes.push(`<div class="bloco"><h3>Cálculo</h3><pre class="calc">${esc(q.ca)}</pre></div>`);
    if (q.cx) partes.push(`<div class="bloco"><h3>Contexto</h3><p>${esc(q.cx)}</p></div>`);
    if (q.pg) partes.push(`<div class="bloco"><h3>Pegadinha</h3><p>${esc(q.pg)}</p></div>`);
    if (q.rc) {
      const nivel = { alta: "Cai sempre", media: "Já caiu mais de uma vez", baixa: "Pouco frequente" }[q.rc.nivel] || "";
      const conta = q.rc.n > 1 ? `Mesmo conceito em ${q.rc.n} questões do banco, vindas de ${q.rc.f} prova${q.rc.f > 1 ? "s" : ""}/simulado${q.rc.f > 1 ? "s" : ""} diferentes.` : "Só esta questão cobra exatamente isso no banco.";
      const prog = q.rc.prog ? "Está no programa da FGV 2026.2." : "Não aparece no programa da FGV 2026.2.";
      partes.push(`<div class="bloco ${q.rc.nivel === "alta" ? "quente" : ""}"><h3>Cai na prova? ${nivel}</h3><p>${esc(conta)} ${esc(prog)}${q.rc.nota ? "\n" + esc(q.rc.nota) : ""}</p></div>`);
    }
    if (q.es) partes.push(`<details class="site"><summary>Explicação original do site</summary><p>${esc(q.es)}</p></details>`);
  } else {
    partes.push(`<div class="bloco"><h3>Explicação do site</h3><p>${esc(q.es || "Sem explicação.")}</p></div>`);
    partes.push(`<p class="mini">Questão do banco de treino: gabarito conferido em varredura, sem a explicação alternativa por alternativa (essa vai para as 200 dos simulados).</p>`);
  }
  if (q.src) partes.push(`<p class="mini">Origem: ${esc(q.src.replace(/^Copy of /, "").replace(/\.pdf$/, ""))}</p>`);
  return partes.join("");
}

function telaMapa(ses) {
  const itens = ses.ids.map((id, i) => {
    const r = ses.resp[id];
    const cls = r ? (acertou(D.q[id], r) ? "ok" : "nok") : "";
    return `<a class="${cls}" href="${ses.base}/${i + 1}">${i + 1}</a>`;
  }).join("");
  const pl = placar(ses);
  tela(`
    <h1>${esc(ses.titulo)}</h1>
    <p class="sub">${pl.feitas}/${pl.total} respondidas · ${pl.certas} certas</p>
    <div class="mapa">${itens}</div>
    <div class="botoes">
      <a class="btn primario" href="${ses.base}/${primeiraPendente(ses)}">Ir para a próxima sem resposta</a>
      ${ses.tipo === "p" ? `<a class="btn" href="${ses.base}/fim">Resultado</a>` : ""}
      <a class="btn" href="#/">Início</a>
    </div>
  `, ses.titulo);
}

function telaFim(ses) {
  const pl = placar(ses);
  if (ses.tipo === "p") {
    const p = ses.prova;
    let i = 0, zerou = false;
    const linhas = p.disciplinas.map((d) => {
      const ids = ses.ids.slice(i, i + d.n); i += d.n;
      const x = placar(ses, ids);
      if (x.certas === 0) zerou = true;
      return `<div class="disc-linha"><div class="linha-topo"><span>${esc(d.nome)}</span><b>${x.certas}/${d.n}</b></div>
        <div class="barra dupla"><span class="ok" style="width:${pct(x.certas, d.n)}%"></span><span class="nok" style="width:${pct(x.feitas - x.certas, d.n)}%"></span></div></div>`;
    }).join("");
    const pendentes = pl.total - pl.feitas;
    const aprovado = pl.certas >= p.aprovacao && !zerou;
    const selo = pendentes ? `<span class="selo neutro">Em andamento</span>` : `<span class="selo ${aprovado ? "ok" : "nok"}">${aprovado ? "Aprovado" : "Reprovado"}</span>`;
    const erradas = ses.ids.map((id, k) => ({ id, k })).filter(({ id }) => ses.resp[id] && !acertou(D.q[id], ses.resp[id]));
    tela(`
      <h1>${esc(p.nome)}</h1>
      <div class="placar">${pl.certas}<span class="mini" style="font-size:20px"> / ${pl.total}</span></div>
      ${selo}
      <p class="sub" style="margin-top:10px">Regra: ${p.aprovacao} certas (70%) e nenhuma disciplina zerada.${pendentes ? ` Faltam ${plural(pendentes, "questão", "questões")} sem resposta.` : zerou ? " Você zerou uma disciplina." : ""}</p>
      <div class="cartao">${linhas}</div>
      ${erradas.length ? `<h2>Erradas (${erradas.length})</h2><div class="cartao"><ul class="lista-limpa">${erradas.map(({ id, k }) =>
        `<li class="disc-linha"><a href="${ses.base}/${k + 1}">${k + 1}. ${esc(D.q[id].p.slice(0, 110))}${D.q[id].p.length > 110 ? "…" : ""}</a></li>`).join("")}</ul></div>` : ""}
      <div class="botoes">
        ${pendentes ? `<a class="btn primario" href="${ses.base}/${primeiraPendente(ses)}">Responder as que faltam</a>` : ""}
        <button class="btn" id="refazer">Refazer prova</button>
        <a class="btn" href="#/">Início</a>
      </div>
    `, ses.titulo);
    $("#refazer").onclick = () => {
      if (!confirm("Apagar as respostas desta prova e começar de novo?")) return;
      E.provas[p.id] = { resp: {} }; salva(); location.hash = `${ses.base}/1`;
    };
    return;
  }
  tela(`
    <h1>${esc(ses.titulo)}</h1>
    <div class="placar">${pl.certas}<span class="mini" style="font-size:20px"> / ${pl.feitas}</span></div>
    <p class="sub">${pl.feitas} respondidas nesta rodada · ${pct(pl.certas, pl.feitas)}% de acerto</p>
    <div class="botoes">
      <button class="btn primario" id="de-novo">${ses.tipo === "e" ? "Nova rodada com as que ainda erro" : "Nova rodada (novas e erradas primeiro)"}</button>
      <a class="btn" href="#/">Início</a>
    </div>
  `, ses.titulo);
  $("#de-novo").onclick = () => {
    if (ses.tipo === "e") novaSessaoErradas(); else novaSessaoTreino(ses.chave);
    location.hash = `${ses.base}/1`;
    rota();
  };
}

function telaTreino() {
  const grupos = {};
  for (const [id, d] of Object.entries(D.disciplinas)) (grupos[d.modalidade] = grupos[d.modalidade] || []).push([id, d]);
  const html = Object.entries(grupos).map(([mod, ds]) => `
    <h2>${esc(mod)}</h2>
    ${ds.map(([id, d]) => {
      const ids = idsDaDisciplina(id);
      const feitas = ids.filter((x) => E.hist[x]);
      const certas = feitas.filter((x) => E.hist[x].ok).length;
      return `<a class="cartao cartao-link" href="#/t/${id}/${sessaoAberta(id)}">
        <div class="linha-topo"><h3>${esc(d.nome)}</h3><span class="mini">${ids.length} q</span></div>
        <div class="barra dupla"><span class="ok" style="width:${pct(certas, ids.length)}%"></span><span class="nok" style="width:${pct(feitas.length - certas, ids.length)}%"></span></div>
        <div class="mini" style="margin-top:6px">${feitas.length ? `${feitas.length} já respondidas · ${pct(certas, feitas.length)}% de acerto` : "Nenhuma respondida"}</div>
      </a>`;
    }).join("")}`).join("");
  tela(`
    <h1>Treino por disciplina</h1>
    <p class="sub">Todo o banco do site (${D.stats.banco} questões). Cada rodada traz primeiro as que você nunca viu, depois as que errou.</p>
    <a class="btn primario" href="#/t/tudo/${sessaoAberta("tudo")}">Tudo misturado</a>
    ${html}
  `, "Treino");
}
function sessaoAberta(chave) {
  const s = E.sessoes["t:" + chave];
  if (!s) return 1;
  const i = s.ids.findIndex((id) => !s.resp[id]);
  return i < 0 ? s.ids.length + 1 : i + 1;
}

function telaResumos() {
  const grupos = {};
  for (const [id, d] of Object.entries(D.disciplinas)) (grupos[d.modalidade] = grupos[d.modalidade] || []).push([id, d]);
  tela(`
    <h1>O que mais cai</h1>
    <p class="sub">Temas que mais se repetem no banco (provas e simulados de 2023–2024) cruzados com o programa da FGV 2026.2.</p>
    ${Object.entries(grupos).map(([mod, ds]) => `<h2>${esc(mod)}</h2>${ds.map(([id, d]) =>
      `<a class="cartao cartao-link" href="#/r/${id}"><div class="linha-topo"><h3>${esc(d.nome)}</h3><span class="mini">${d.resumo ? d.resumo.length + " temas" : "em revisão"}</span></div></a>`).join("")}`).join("")}
  `, "O que mais cai");
}
function telaResumo(id) {
  const d = D.disciplinas[id];
  if (!d) return telaResumos();
  const itens = (d.resumo || []).map((r) => `
    <li class="resumo-item"><h3>${esc(r.tema)}</h3>
      <div class="mini">${r.questoes_no_banco ? `${r.questoes_no_banco} questões no banco` : ""}${r.fontes ? ` · ${r.fontes} fontes` : ""}</div>
      <p>${esc(r.o_que_saber)}</p></li>`).join("");
  tela(`
    <h1>${esc(d.nome)}</h1>
    <p class="sub">${esc(d.modalidade)} · ${d.n} questões no banco</p>
    ${d.mudancas ? `<div class="bloco alerta"><h3>O que mudou com a lei nova</h3><p>${esc(d.mudancas)}</p></div>` : ""}
    <div class="cartao">${itens ? `<ul class="lista-limpa">${itens}</ul>` : '<p class="vazio">Resumo ainda não gerado.</p>'}</div>
    <div class="botoes"><a class="btn primario" href="#/t/${id}/${sessaoAberta(id)}">Treinar esta disciplina</a><a class="btn" href="#/r">Voltar</a></div>
  `, "O que mais cai");
}

const GRADE_FGV = [
  ["Capitalização — 05/12, 14h–16h", [["Fundamentos da Operação de Seguros", 8], ["Mercado Financeiro e Gestão Empresarial", 8], ["Matemática Financeira", 10], ["Capitalização", 8], ["Estratégia de Comercialização de Seguros", 8], ["Direito do Seguro e Fundamentos Jurídicos", 8]]],
  ["Vida e Previdência — 05/12, 16h30–18h30", [["Legislação e Organização Profissional", 10], ["Previdência Privada", 20], ["Seguro de Pessoas (VI, VG, VP, AP)", 20]]],
  ["Danos — 06/12, 14h–18h30 (intervalo de 30 min)", [["Seguros de Automóvel", 20], ["Responsabilidade Civil Geral", 18], ["Seguros Compreensivos", 15], ["Transportes", 12], ["Risco de Engenharia", 10], ["Seguro Garantia", 10], ["Patrimonial — Nomeados e Operacionais", 10], ["Riscos Diversos", 5]]],
];

function telaSobre() {
  const st = D.stats.simulado_status || {};
  const nomes = { confere: "gabarito confere", diverge: "gabarito corrigido", ambigua: "ambíguas", desatualizada: "desatualizadas pela lei nova", "sem revisão": "sem revisão" };
  tela(`
    <h1>Sobre a prova FGV 2026.2</h1>
    <div class="cartao texto">
      <p><b>Datas:</b> inscrição até 23/11 (pagamento até 25/11). Provas on-line em 05/12 (Capitalização e Vida e Previdência) e 06/12 (Danos). Resultado final em 10/01/2027.</p>
      <p><b>Aprovação:</b> 70% de acerto no total da área <b>e sem zerar nenhuma disciplina</b>.</p>
      <p><b>Formato:</b> a prova da FGV tem <b>4 alternativas (A a D)</b>. As questões deste app vêm de provas antigas com 5 (A a E); o conteúdo é o mesmo, só fica uma distração a mais.</p>
      <p><b>Calculadora:</b> a FGV dá uma HP12C virtual na plataforma; calculadora própria não pode.</p>
    </div>
    <h2>Grade oficial (questões por disciplina)</h2>
    ${GRADE_FGV.map(([t, ds]) => `<div class="cartao"><h3>${esc(t)}</h3><table class="grade">${ds.map(([n, q]) => `<tr><td>${esc(n)}</td><td>${q}</td></tr>`).join("")}</table></div>`).join("")}
    <h2>O que é diferente do simulado do site</h2>
    <div class="cartao texto">
      <p>Os 4 simulados seguem o formato antigo (ENS), com 4 dias e disciplinas como LGPD, Lucros Cessantes, Riscos Rurais e Gerenciamento de Riscos separadas. Na FGV 2026.2:</p>
      <ul>
        <li>Danos é uma prova só, de 100 questões, com <b>Automóvel (20)</b> e <b>RC Geral (18)</b> pesando mais.</li>
        <li><b>Seguro Garantia</b> vale 10 questões e quase não aparece no banco: estude pelo resumo de Demais Ramos e pelo programa (Circular SUSEP 662/2022, Lei 14.133/2021).</li>
        <li>Previdência Privada e Seguro de Pessoas valem 20 cada em Vida e Previdência.</li>
        <li><b>Comercialização</b> e <b>Mercado Financeiro</b> caem na prova de <b>Capitalização</b> (8 questões cada), não na de Vida e Previdência. <b>LGPD</b> aparece dentro de Seguro de Pessoas.</li>
        <li>Quase todas as disciplinas citam a <b>Lei 15.040/2024</b> (Lei do Contrato de Seguro), em vigor desde dez/2025. Ela revogou os artigos de seguro do Código Civil. Questão antiga que dependia do Código Civil está marcada como "Lei mudou".</li>
        <li>O programa ainda cita a Res. CNSP 407/2021 (riscos nomeados e operacionais). Ela vale no dia da prova; a Res. CNSP 496/2026 a substitui a partir de 05/01/2027.</li>
      </ul>
    </div>
    <h2>Temas do programa que o banco quase não cobre</h2>
    <div class="cartao texto">
      <p>Estes caem na FGV e têm pouca ou nenhuma questão no banco. Estão nos resumos de "O que mais cai", com 0 questões:</p>
      <ul>
        <li><b>Seguro Garantia</b> (10 questões na FGV): modalidades, partes, Circular SUSEP 662/2022, Lei 14.133/2021.</li>
        <li><b>RC na Lei 15.040</b>: ação direta do terceiro, chamamento ao processo, transação, vários prejudicados (arts. 98 a 107).</li>
        <li><b>Seguro de Pessoas</b>: suicídio e carência, prescrição (art. 126), beneficiário (arts. 113 a 115).</li>
        <li><b>Previdência</b>: LC 108 e 109/2001, PGBL x VGBL na sucessão, regime de IR escolhido até o resgate (Lei 14.803/2024).</li>
        <li><b>Matemática Financeira</b>: SAC x PRICE, taxa nominal x efetiva.</li>
        <li><b>Mercado Financeiro</b>: Open Finance e Open Insurance, derivativos para hedge.</li>
      </ul>
    </div>
    <h2>De onde vêm as questões</h2>
    <div class="cartao texto">
      <p>Raspadas de examecorretor.com.br (plataforma independente, sem vínculo oficial) em 11/10/2026: os 4 simulados (200 questões) e o banco de treino (${D.stats.banco} questões, de provas e simulados de 2023–2024).</p>
      <p>As 200 dos simulados foram revisadas uma a uma contra a lei vigente: ${Object.entries(st).map(([k, v]) => `${v} ${nomes[k] || k}`).join(", ")}. Cada uma tem o porquê da certa, o porquê de cada errada, contexto e se o tema costuma cair.</p>
      <p>O resto do banco passou por uma varredura de gabarito (${D.stats.flags_banco} marcadas) e mostra a explicação original do site.</p>
    </div>
    <h2>Preferências</h2>
    <div class="cartao">
      <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="pref-detalhe" ${E.pref.detalheAberto ? "checked" : ""}> Abrir o detalhe automaticamente ao responder</label>
      <div class="botoes"><button class="btn perigo" id="zerar">Apagar todo o meu progresso</button></div>
      <p class="mini" style="margin-top:10px">O progresso fica salvo só neste aparelho.</p>
    </div>
  `, "Sobre");
  $("#pref-detalhe").onchange = (e) => { E.pref.detalheAberto = e.target.checked; salva(); };
  $("#zerar").onclick = () => {
    if (!confirm("Apagar todas as respostas, provas e treinos deste aparelho?")) return;
    E = { hist: {}, provas: {}, sessoes: {}, pref: E.pref }; salva(); location.hash = "#/";
  };
}

// ---------- rotas ----------
let teclado = null;
document.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey || /input|textarea/i.test(ev.target.tagName)) return;
  if (teclado) teclado(ev);
});

function rota() {
  teclado = null;
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = partes;
  if (!a) return telaInicio();
  if (a === "sobre") return telaSobre();
  if (a === "r") return b ? telaResumo(b) : telaResumos();
  if (a === "t" && !b) return telaTreino();
  let ses = null, resto = null;
  if (a === "p") { ses = sessao("p", b); resto = c; }
  else if (a === "t") { ses = sessao("t", b); resto = c; }
  else if (a === "e") { ses = sessao("e"); resto = b; }
  if (!ses) return telaInicio();
  if (resto === "mapa") return telaMapa(ses);
  if (resto === "fim") return telaFim(ses);
  if (!resto) { location.replace(`${ses.base}/${primeiraPendente(ses)}`); return; }
  return telaQuestao(ses, parseInt(resto, 10) || 1);
}

async function inicia() {
  try {
    const r = await fetch("dados.json");
    D = await r.json();
  } catch (e) {
    $("#tela").innerHTML = '<p class="vazio">Não consegui carregar as questões. Abra uma vez com internet para guardar o app no aparelho.</p>';
    return;
  }
  window.addEventListener("hashchange", rota);
  rota();
}

if ("serviceWorker" in navigator) {
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (tinhaControle) avisa("Nova versão das questões baixada.", { rotulo: "Recarregar", fn: () => location.reload() });
  });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

inicia();
