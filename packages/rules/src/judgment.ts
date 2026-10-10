import { hasText, isInteractive } from './predicates';
import type { JudgmentRule } from './types';

const LAWS = 'https://lawsofux.com/';
const NN = 'https://www.nngroup.com/articles/ten-usability-heuristics/';

type Def = Omit<JudgmentRule, 'kind' | 'version' | 'scopes' | 'conformance'> &
  Partial<Pick<JudgmentRule, 'scopes' | 'conformance'>>;
const law = (d: Def): JudgmentRule => ({ kind: 'judgment', version: '1.0.0', scopes: ['element', 'page'], conformance: 'law', ...d });

/** Element- and page-level laws. The model answers `question`, citing `evidence`. */
const LAWS_OF_UX: JudgmentRule[] = [
  law({
    id: 'law-fitts', name: "Fitts's law", criterion: "Fitts's law", source: { title: 'Laws of UX', url: `${LAWS}fittss-law/` },
    summary: 'Time to reach a target depends on its size and distance. Bigger, closer targets are faster to hit.',
    question: 'Given the measured size and position, how easy is this target to reach, and what would change that? Do not state a universal pass/fail size.',
    evidence: ['a11y.tapTarget', 'size.position'], appliesTo: isInteractive,
  }),
  law({
    id: 'law-hick', name: "Hick's law", criterion: "Hick's law", source: { title: 'Laws of UX', url: `${LAWS}hicks-law/` },
    summary: 'Decision time grows with the number and complexity of choices.',
    question: 'How many competing choices does this element present or sit among, and does that slow the decision?',
    evidence: ['structure.childCount', 'structure.componentType'],
  }),
  law({
    id: 'law-proximity', name: 'Law of proximity', criterion: 'Gestalt: proximity', source: { title: 'Laws of UX', url: `${LAWS}law-of-proximity/` },
    summary: 'Items close together are perceived as a group.',
    question: 'Does the measured spacing group related content and separate unrelated content?',
    evidence: ['spacing.padding', 'spacing.margin', 'spacing.gap'],
  }),
  law({
    id: 'law-similarity', name: 'Law of similarity', criterion: 'Gestalt: similarity', source: { title: 'Laws of UX', url: `${LAWS}law-of-similarity/` },
    summary: 'Elements that look alike are perceived as related.',
    question: 'Does the repeat count suggest this style is a shared pattern, and does it read as related to its siblings?',
    evidence: ['consistency.sameStyleCount', 'typography.fontSize', 'color.background', 'shape.borderRadius'],
  }),
  law({
    id: 'law-common-region', name: 'Law of common region', criterion: 'Gestalt: common region', source: { title: 'Laws of UX', url: `${LAWS}law-of-common-region/` },
    summary: 'Elements inside a shared boundary are perceived as a group.',
    question: 'Does a border, background or shadow create a container that groups its contents?',
    evidence: ['shape.borderWidth', 'color.background', 'shape.boxShadow', 'shape.borderRadius'],
  }),
  law({
    id: 'law-von-restorff', name: 'Von Restorff effect', criterion: 'Von Restorff (isolation) effect', source: { title: 'Laws of UX', url: `${LAWS}von-restorff-effect/` },
    summary: 'The item that differs most from its surroundings is the one remembered.',
    question: 'Does this element stand out from what surrounds it, and through which measured property (contrast, size, color, isolation)?',
    evidence: ['color.contrast', 'color.background', 'typography.fontSize', 'typography.fontWeight', 'consistency.sameStyleCount'],
  }),
  law({
    id: 'law-aesthetic-usability', name: 'Aesthetic-usability effect', criterion: 'Aesthetic-usability effect', source: { title: 'Laws of UX', url: `${LAWS}aesthetic-usability-effect/` },
    summary: 'People perceive attractive designs as easier to use.',
    question: 'Does visual polish here risk masking a usability problem shown in the measured checks?',
    evidence: ['shape.borderRadius', 'shape.boxShadow'],
  }),
  law({
    id: 'law-jakob', name: "Jakob's law", criterion: "Jakob's law", source: { title: 'Laws of UX', url: `${LAWS}jakobs-law/` },
    summary: 'Users expect your site to work like the sites they already know.',
    question: 'Does this follow the common convention for its component type, or depart from it? Name the convention.',
    evidence: ['structure.tag', 'structure.role', 'structure.componentType'],
  }),
  law({
    id: 'principle-visual-hierarchy', name: 'Visual hierarchy', criterion: 'Visual hierarchy', source: { title: 'Design principle' }, conformance: 'heuristic',
    summary: 'Size, weight, contrast and position decide reading order.',
    question: 'Where does this element sit in the reading order, and what measured property puts it there?',
    evidence: ['typography.fontSize', 'typography.fontWeight', 'color.contrast', 'size.position'], appliesTo: hasText,
  }),
];

const nielsen = (n: number, name: string, summary: string, question: string): JudgmentRule => ({
  kind: 'judgment', version: '1.0.0', scopes: ['page'], conformance: 'heuristic',
  id: `nielsen-${n}`, name, criterion: `Nielsen heuristic #${n}: ${name}`, source: { title: 'Nielsen Norman Group', url: NN },
  summary, question, evidence: [],
});

/** Page-level only: these need task context a single element cannot provide. */
const NIELSEN: JudgmentRule[] = [
  nielsen(1, 'Visibility of system status', 'Keep users informed about what is going on.', 'What status or feedback is visible? Do not judge flows you cannot see.'),
  nielsen(2, 'Match between system and the real world', "Speak the users' language.", 'Does the vocabulary and ordering match the likely audience?'),
  nielsen(3, 'User control and freedom', 'Provide clear exits and undo.', 'Are exits, back paths or cancel actions visible?'),
  nielsen(4, 'Consistency and standards', 'Follow platform and industry conventions.', 'Do repeated components share styles (see repeat counts)? Do they follow conventions?'),
  nielsen(5, 'Error prevention', 'Prevent problems before they happen.', 'Are there visible constraints or confirmations on risky actions?'),
  nielsen(6, 'Recognition rather than recall', 'Make options visible.', 'Are options and labels visible rather than hidden behind memory?'),
  nielsen(7, 'Flexibility and efficiency of use', 'Offer shortcuts for experts.', 'Are there visible accelerators? Mark as not observable if none can be seen.'),
  nielsen(8, 'Aesthetic and minimalist design', 'Remove irrelevant information.', 'Does every visible element earn its place? What competes with the primary goal?'),
  nielsen(9, 'Help users recognize, diagnose, and recover from errors', 'Errors in plain language with a fix.', 'Are any error states visible? If not, say it cannot be judged here.'),
  nielsen(10, 'Help and documentation', 'Provide easy-to-find help.', 'Is help or documentation reachable from this page?'),
];

export const JUDGMENT_RULES: JudgmentRule[] = [...LAWS_OF_UX, ...NIELSEN];
