const sectionContainers = ".idp-shell, .idp-player-profile, .idp-workflow-board";

function sameContainer(first, second) {
  return first?.nodeType === 1 && second?.nodeType === 1 &&
    first.tagName === second.tagName && first.className === second.className &&
    first.attributes.length === second.attributes.length &&
    [...first.attributes].every((attribute) => second.getAttribute(attribute.name) === attribute.value);
}

function updateSection(live, previous, next) {
  // Compare render snapshots, so open disclosures and other local DOM state survive.
  if (previous.isEqualNode(next)) return;
  if (sameContainer(previous, next) && previous.matches(sectionContainers) &&
      previous.childNodes.length === next.childNodes.length &&
      live.childNodes.length === previous.childNodes.length) {
    const liveChildren = [...live.childNodes];
    [...next.childNodes].forEach((child, index) => {
      updateSection(liveChildren[index], previous.childNodes[index], child);
    });
    return;
  }
  live.replaceWith(next.cloneNode(true));
}

export function updateIdpWorkspaceMarkup(root, markup, previousMarkup, { preserveSections = false } = {}) {
  const doc = root.ownerDocument;
  if (!preserveSections || !previousMarkup || !doc?.createElement || !root.firstElementChild) {
    root.innerHTML = markup;
    return;
  }
  const previous = doc.createElement("template");
  const next = doc.createElement("template");
  previous.innerHTML = previousMarkup;
  next.innerHTML = markup;
  updateSection(root.firstElementChild, previous.content.firstElementChild, next.content.firstElementChild);
}
