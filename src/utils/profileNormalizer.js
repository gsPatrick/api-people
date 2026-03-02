export const normalizeDate = (dateText) => {
    if (!dateText) return null;
    if (/(present|presente|atual|o momento)/i.test(dateText)) return null;

    const MONTHS = {
        'janeiro': '01', 'january': '01', 'jan': '01',
        'fevereiro': '02', 'february': '02', 'feb': '02',
        'março': '03', 'march': '03', 'mar': '03',
        'abril': '04', 'april': '04', 'apr': '04',
        'maio': '05', 'may': '05',
        'junho': '06', 'june': '06', 'jun': '06',
        'julho': '07', 'july': '07', 'jul': '07',
        'agosto': '08', 'august': '08', 'aug': '08',
        'setembro': '09', 'september': '09', 'sep': '09',
        'outubro': '10', 'october': '10', 'oct': '10',
        'novembro': '11', 'november': '11', 'nov': '11',
        'dezembro': '12', 'december': '12', 'dec': '12'
    };

    const match = dateText.match(/([a-zA-Zç]+)\s+(?:de\s+)?(\d{4})/i);
    if (match) {
        const monthVal = MONTHS[match[1].toLowerCase()];
        if (monthVal) return `${match[2]}-${monthVal}`;
    }
    return null;
};

export const sanitizeText = (text) => {
    if (!text) return '';
    return text
        .replace(/Page \d+ of \d+/gi, '')
        .replace(/-- \d+ of \d+ --/gi, '')
        .replace(/-- Page \d+ of \d+ --/gi, '')
        .split('\n')
        // FIX: No trim here to detect indentation? No, PDF parse usually flattens.
        .map(line => line.trim())
        .filter(line => line && line.length > 0)
        .join('\n');
};

// Global Regex Constants
const KW_RESUMO = /^(resumo|summary)$/i;
const KW_XP = /^(experiência|experience)$/i;
const KW_EDU = /^(formação acadêmica|education|formação)$/i;
const KW_SKILLS = /^(principais competências|competências|skills|top skills)$/i;
const KW_CERT = /^(certifications|certificações)$/i;
const KW_IGNORE = /^(idiomas|languages|honors & awards|projects|projetos)$/i;

export const splitSections = (text) => {
    const lines = text.split('\n');
    const sections = {
        header_context: [],
        resumo: '',
        experiencia: [],
        formacao: [],
        skills: [],
        certificacoes: [],
        outros: [],
        _meta: {
            lastSectionBeforeResumo: 'header_context',
            dataBeforeResumo: []
        }
    };

    let current = 'header_context';
    let foundResumo = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (!foundResumo && KW_RESUMO.test(trimmed)) {
            sections._meta.lastSectionBeforeResumo = current;
            if (current === 'header_context') sections._meta.dataBeforeResumo = [...sections.header_context];
            else if (Array.isArray(sections[current])) sections._meta.dataBeforeResumo = [...sections[current]];

            foundResumo = true;
            current = 'resumo';
            continue;
        }

        if (KW_XP.test(trimmed)) { current = 'experiencia'; continue; }
        if (KW_EDU.test(trimmed)) { current = 'formacao'; continue; }
        if (KW_SKILLS.test(trimmed)) { current = 'skills'; continue; }
        if (KW_CERT.test(trimmed)) { current = 'certificacoes'; continue; }
        if (KW_IGNORE.test(trimmed)) { current = 'outros'; continue; }

        // Generic append
        if (Array.isArray(sections[current])) {
            sections[current].push(line);
        } else if (current === 'resumo') {
            sections.resumo += (sections.resumo ? '\n' : '') + line;
        }
    }

    return sections;
};

export const parseExperiences = (experienceText) => {
    const lines = Array.isArray(experienceText) ? experienceText : (experienceText || '').split('\n');
    const experiences = [];
    let currentExp = null;
    const dateLineRegex = /((?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:de\s*)?\d{4}|presente|present|atual)\s*[-–]\s*((?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:de\s*)?\d{4}|presente|present|atual)/i;
    let buffer = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        if (dateLineRegex.test(line)) {
            let cargo = "Cargo Indefinido";
            let empresa = "Empresa Indefinida";
            if (buffer.length >= 2) {
                cargo = buffer.pop();
                empresa = buffer.pop();
                if (currentExp && buffer.length > 0) currentExp.descricao += (currentExp.descricao ? '\n' : '') + buffer.join('\n');
            } else if (buffer.length === 1) {
                empresa = buffer.pop();
            }

            const dates = line.match(/((?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:de\s*)?\d{4}|presente|present|atual)/gi);
            currentExp = {
                empresa: empresa,
                cargo: cargo,
                localizacao: null,
                inicio: normalizeDate(dates ? dates[0] : null),
                fim: normalizeDate(dates && dates.length > 1 ? dates[1] : null),
                descricao: ""
            };
            experiences.push(currentExp);
            buffer = [];
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                if (nextLine.length < 60 && (nextLine.includes(',') || /brasil|brazil|united states|eua|remoto|remote/i.test(nextLine))) {
                    if (!dateLineRegex.test(nextLine)) {
                        currentExp.localizacao = nextLine;
                        i++;
                    }
                }
            }
        } else {
            buffer.push(line);
        }
    }
    if (currentExp && buffer.length > 0) currentExp.descricao += (currentExp.descricao ? '\n' : '') + buffer.join('\n');
    return experiences;
};

const parseEducation = (eduLines) => {
    if (!eduLines) return [];
    const lines = Array.isArray(eduLines) ? eduLines : (eduLines || '').split('\n');
    const filteredLines = lines.filter(l => l.trim());
    const education = [];
    for (let i = 0; i < filteredLines.length; i++) {
        const line = filteredLines[i];
        const dateMatch = line.match(/(\d{4})\s*[-–]\s*(\d{4})/);
        if (dateMatch) {
            const curso = i > 0 ? filteredLines[i - 1] : "Curso Indefinido";
            const instituicao = i > 1 ? filteredLines[i - 2] : (i > 0 ? "Instituição (Verificar)" : "Instituição Indefinida");
            const cursoFinal = curso !== instituicao ? curso : "";
            education.push({
                instituicao: instituicao,
                curso: cursoFinal,
                inicio: `${dateMatch[1]}-01`,
                fim: `${dateMatch[2]}-12`
            });
        }
    }
    return education;
};

export const buildCanonicalProfile = (rawPdfText) => {
    const cleanBody = sanitizeText(rawPdfText);
    const sections = splitSections(cleanBody);

    let nome = null;
    let titulo = null;
    let localizacao = null;
    let linkedin = null;

    const contextLines = sections.header_context.filter(l => l.trim());
    const linkedinLine = contextLines.find(l => l.includes('linkedin.com'));
    if (linkedinLine) linkedin = linkedinLine;

    const extractFromTail = (linesSource) => {
        // FILTER: Remove Sidebar headers and anything BELOW them
        // If we find "Certifications" or "Competências", we must CUT the array there (keep ONLY what is above).
        // Sidebar comes BEFORE name in stream, OR AFTER?
        // In the linear stream seen from previous output, "Certifications" appeared mixed in.
        // User output showed "Imersão Dados" as name. This means Certifications were at the BOTTOM of the trapped block.
        // So we need to finding the Sidebar Header and DISCARD it and everything BELOW it.

        let validLines = [];
        let stopProcessing = false;

        // Iterate forward to clean sidebar
        for (const l of linesSource) {
            const lower = l.toLowerCase();
            // If hits sidebar header, STOP adding lines (assuming noise follows)
            if (KW_CERT.test(lower) || KW_SKILLS.test(lower) || lower === 'contato') {
                stopProcessing = true; // Flag to stop? 
                // Wait, if sidebar comes FIRST (before Main), then we should discard everything processed SO FAR?
                // No, usually Sidebar is AFTER valid content in header context if render_page worked.
                // But in Trapped context, Sidebar might be the SECTION ITSELF.
                // The user's case: "Certifications" lines ("Imersão...") were confused for Name.
                // This means they were at the END of the specific block we looked at.
                // So valid content is BEFORE them.
                continue; // Skip the header itself
            }
            // Heuristic: If we see a sidebar item like "Imersão...", we might not know it is trash unless we saw header.
            // But strict filtering:
            if (!stopProcessing &&
                !l.includes('linkedin.com') &&
                !lower.startsWith('page ') &&
                !l.includes('www.')) {
                validLines.push(l);
            }
            if (stopProcessing) {
                // If we hit a known Sidebar Header, we should actually DISCARD what comes *after* it in this block? 
                // Or was the sidebar header appearing *above* the certification items? Yes.
                // So enabling stopProcessing means we ignore subsequent lines.
            }
        }

        // RE-FILTER: If we didn't catch the header (maybe splitSections ate it), we might still have certification noise.
        // Heuristic: Certifications often look like "Curso XYZ". Hard to distinguish from Name.
        // But Name is closer to "Resumo" anchor?
        // In the user image: Name is strictly ABOVE Resumo.
        // Sidebar is strictly LEFT.

        // Let's rely on candidates slice.
        // If "Imersão..." was picked as Name, it means it was in candidates[0].
        // And "Laísa Brunca" was.... where?
        // If "Imersão" was name, then name was considered "Imersão".
        // Where was Laísa?
        // Maybe Laísa was further UP the list, outside slice(-6)?
        // Or "Imersão" was effectively "closer" to Resumo?
        // If Sidebar is read AFTER Main, then Sidebar is closer to Resumo in the text stream?
        // "Name... \n Resumo \n Sidebar..." -> No, Resumo splits.
        // "Name... \n Sidebar... \n Resumo" -> This is the danger.

        // FIX: If we see Sidebar header in validLines, truncate everything after it.
        const certIndex = validLines.findIndex(l => KW_CERT.test(l) || KW_SKILLS.test(l));
        if (certIndex !== -1) {
            validLines = validLines.slice(0, certIndex);
        }

        // Now take tail
        const clean = validLines.filter(l => l && l.trim());
        let n = null, t = null, l = null;

        if (clean.length > 0) {
            // Take up to last 8 lines to be safe
            let candidates = clean.slice(-8);

            // 1. Identify Location (Bottom-Up)
            for (let i = candidates.length - 1; i >= 0; i--) {
                const item = candidates[i];
                if (!l && (item.includes(',') || /brasil|brazil|paulo|minas|rio|janeiro|united states|kingdom|portugal/i.test(item))) {
                    l = item;
                    candidates.splice(i, 1);
                    break;
                }
            }

            // 2. Identify Name vs Title (Top-Down on remaining)
            if (candidates.length > 0) {
                // First candidate should be Name. 
                // Validate: Name shouldn't be a known "trash" string or purely title keywords if possible.
                // Name usually has no numbers, no |

                let possibleName = candidates[0];
                const looksLikeTitle = /(engineer|developer|desenvolvedor|analyst|analista|specialist|especialista|manager|gerente|consultant|consultor|\||—|-|imersão|bootcamp|curso)/i.test(possibleName) || possibleName.length > 40;
                // Added 'imersão|bootcamp|curso' to exclude certs that slipped through

                if (!looksLikeTitle) {
                    n = candidates.shift(); // That's our Name
                }

                // Remaining is Title
                if (candidates.length > 0) {
                    t = candidates.join(' '); // Merge multi-line title
                }
            }
        }
        return { nome: n, titulo: t, localizacao: l };
    };

    const res1 = extractFromTail(contextLines);
    nome = res1.nome;
    titulo = res1.titulo;
    localizacao = res1.localizacao;

    if (!nome && sections._meta.lastSectionBeforeResumo !== 'header_context') {
        const trappedLines = sections._meta.dataBeforeResumo || [];
        const res2 = extractFromTail(trappedLines);
        if (res2.nome || res2.titulo) {
            if (res2.nome) nome = res2.nome;
            if (res2.titulo) titulo = res2.titulo;
            if (res2.localizacao) localizacao = res2.localizacao;
        }
    }

    const experiences = parseExperiences(sections.experiencia);
    const formacao = parseEducation(sections.formacao);
    const skills = sections.skills
        // @ts-ignore
        ? sections.skills.join('\n').split(/[,·\n]/).map(s => s.trim()).filter(s => s.length > 2)
        : [];

    return {
        perfil: { nome, titulo, linkedin, localizacao },
        resumo: sections.resumo ? sections.resumo.trim() : null,
        experiencias: experiences,
        formacao: formacao,
        skills: [...new Set(skills)]
    };
};
