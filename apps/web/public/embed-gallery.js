(() => {
  const form = document.querySelector("#gallery-filters");
  const list = document.querySelector("#project-list");
  const count = document.querySelector("#result-count");
  const status = document.querySelector("#gallery-status");
  const submit = form?.querySelector("button[type=submit]");
  if (!form || !list || !count || !status || !submit) return;

  function createCard(project) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "project";
    link.href = `/projects/${encodeURIComponent(project.id)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    if (project.thumbnailAssetId) {
      const image = document.createElement("img");
      image.className = "project-image";
      image.src = `/api/v1/assets/${encodeURIComponent(project.thumbnailAssetId)}`;
      image.alt = "";
      image.loading = "lazy";
      link.append(image);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "project-image project-image-fallback";
      fallback.setAttribute("aria-hidden", "true");
      fallback.textContent = project.title;
      link.append(fallback);
    }

    const copy = document.createElement("span");
    copy.className = "project-copy";
    const context = document.createElement("span");
    context.className = "project-context";
    context.textContent = project.eventName + (project.trackName ? ` · ${project.trackName}` : "");
    const title = document.createElement("strong");
    title.textContent = project.title;
    const description = document.createElement("span");
    description.className = "project-description";
    description.textContent = project.tagline || project.description;
    const team = document.createElement("span");
    team.className = "project-team";
    team.textContent = project.teamName;
    copy.append(context, title, description, team);
    link.append(copy);
    item.append(link);
    return item;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const params = new URLSearchParams(new FormData(form));
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    submit.disabled = true;
    status.textContent = "Loading submitted projects…";
    count.textContent = "Loading submitted projects…";
    try {
      const response = await fetch(`/api/v1/gallery?${params.toString()}`, { credentials: "omit" });
      if (!response.ok) throw new Error("Gallery request failed");
      const data = await response.json();
      const projects = Array.isArray(data.projects) ? data.projects : [];
      list.replaceChildren(...projects.map(createCard));
      count.textContent = projects.length
        ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
        : "No submitted projects match these filters. Try a different search.";
      status.textContent = count.textContent;
      const url = params.size ? `${location.pathname}?${params}` : location.pathname;
      history.replaceState(null, "", url);
    } catch {
      count.textContent = "The gallery could not load. Check your connection and try again.";
      status.textContent = count.textContent;
    } finally {
      submit.disabled = false;
    }
  });
})();
