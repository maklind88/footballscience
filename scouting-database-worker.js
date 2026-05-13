self.window = self;

self.addEventListener("message", (event) => {
  if (event.data?.type !== "load") {
    return;
  }

  try {
    const scriptUrl = String(event.data.scriptUrl || "scouting-import-data.js");
    self.__footballScienceScoutingDatabase = null;
    importScripts(scriptUrl);
    const database = self.__footballScienceScoutingDatabase;

    if (!database || !Array.isArray(database.records) || !Array.isArray(database.metrics)) {
      throw new Error("Scouting player database did not register.");
    }

    self.postMessage({
      type: "database",
      database,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error?.message || "Scouting player database could not be loaded.",
    });
  }
});
