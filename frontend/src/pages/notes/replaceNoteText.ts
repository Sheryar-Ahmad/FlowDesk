import type { EditorState, Transaction } from "@tiptap/pm/state"

export function replaceNoteText(state: EditorState, find: string, replacement: string): Transaction | null {
  if (!find) return null
  const matches: { from: number; to: number }[] = []
  state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return
    let index = node.text.indexOf(find)
    while (index !== -1) {
      matches.push({ from: position + index, to: position + index + find.length })
      index = node.text.indexOf(find, index + find.length)
    }
  })
  if (!matches.length) return null
  const transaction = state.tr
  // Work backwards so earlier text positions stay valid as lengths change.
  for (const { from, to } of matches.reverse()) {
    transaction.insertText(replacement, from, to)
  }
  return transaction
}
