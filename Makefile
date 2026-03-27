UUID         = spotify-controller@narkagni
INSTALL_PATH = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SCHEMAS_DIR  = schemas

all: install

build-schemas:
	glib-compile-schemas $(SCHEMAS_DIR)

install: build-schemas
	rm -rf $(INSTALL_PATH)
	mkdir -p $(INSTALL_PATH)
	mkdir -p $(INSTALL_PATH)/core
	mkdir -p $(INSTALL_PATH)/ui
	cp extension.js    $(INSTALL_PATH)/
	cp prefs.js        $(INSTALL_PATH)/
	cp stylesheet.css  $(INSTALL_PATH)/
	cp metadata.json   $(INSTALL_PATH)/
	cp -r icons/       $(INSTALL_PATH)/icons/
	cp -r schemas/     $(INSTALL_PATH)/schemas/
	cp core/*.js       $(INSTALL_PATH)/core/
	cp ui/*.js         $(INSTALL_PATH)/ui/
	@echo "Spotify Controller installed. Restart GNOME Shell to apply."

pack: build-schemas
	zip -r $(UUID).zip . \
		-x "*.git*" \
		-x "Makefile" \
		-x "README.md" \
		-x "media/*" \
		-x "*.zip"

uninstall:
	rm -rf $(INSTALL_PATH)
	@echo "Spotify Controller uninstalled."

clean:
	rm -f $(SCHEMAS_DIR)/gschemas.compiled
	rm -f *.zip