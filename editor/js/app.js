var util = llmr.util;

var Dropdown = require('./dropdown.js');
var StyleList = require('./stylelist.js');
var DataFilterView = require('./datafilterview.js');
var LayerView = require('./layerview.js');

module.exports = App;
function App(root) {
    var app = this;

    this.layerViews = [];

    this._setupStyleDropdown();
    this._setupAddData();
    this._setupMap();
    this._setupLayers();
}


App.prototype._setupStyleDropdown = function() {
    var app = this;

    var dropdown = this.dropdown = new Dropdown($('#styles'));

    $("#new-style-template").dialog({
        autoOpen: false,
        modal: true,
        draggable: false,
        title: "Create New Style",
        width: 350,
        height: 120,
        buttons: [{ text: "Create", type: "submit" }],
        open: function(){
            $(this).unbind('submit').submit(function() {
                var name = $(this).find('#new-style-name').val();
                if (name) {
                    list.select(list.create(defaultStyle, name));
                    $(this).dialog("close");
                }
                return false;
            });
        },
        close: function() {
            $(this).find('#new-style-name').val("");
        }
    });

    $('#add-style').click(function() {
        $("#new-style-template").dialog("open");
    });

    var list = new StyleList();
    list.on('add', function(name) {
        dropdown.add(name.replace(/^llmr\/styles\//, ''), name);
    });
    list.on('change', function(name, style) {
        app.setStyle(style);
        dropdown.select(name);
    });
    list.on('load', function() {
        if (!list.active) {
            $("#new-style-template").dialog("open");
        } else {
            list.select(list.active);
        }
    });

    $(dropdown)
        .on('item:select', function(e, name) {
            list.select(name);
        })
        .on('item:remove', function(e, name) {
            list.remove(name);
        });
};

App.prototype._setupMap = function() {
    var app = this;

    this.map = new llmr.Map({
        container: document.getElementById('map'),
        layers: [{
            type: 'vector',
            id: 'streets',
            urls: ['/gl/tiles/{z}-{x}-{y}.vector.pbf'],
            zooms: [0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14]
        }],
        maxZoom: 20,
        zoom: 15,
        lat: 38.912753,
        lon: -77.032194,
        rotation: 0,
        hash: true,
        style: {}
    });

    this.map.layers.forEach(function(layer) {
        app._setupLayerEvents(layer);
    });

    // Also add event handlers to newly added layers
    this.map.on('layer.add', function(layer) {
        app._setupLayerEvents(layer);
    });


    var zoomlevel = $('#zoomlevel');
    this.map.on('zoom', function() {
        zoomlevel.text('z' + llmr.util.formatNumber(app.map.transform.z, 2));
    }).fire('zoom');


    var compass = $('#compass');
    var arrow = $('.arrow', compass);
    compass.on('click', function() {
        app.map.resetNorth();
    });
    this.map.on('rotation', function() {
        var angle = (app.map.transform.angle / Math.PI * 180) - 90;
        arrow.css('-webkit-transform', 'rotate(' + angle + 'deg)');
        compass.toggleClass('reset', app.map.transform.angle === 0);
    }).fire('rotation');
};

App.prototype._setupLayerEvents = function(layer) {
    var app = this;
    layer.on('tile.load', function() {
        app.updateStats(layer.stats());
    });
    layer.on('tile.remove', function() {
        app.updateStats(layer.stats());
    });
    app.updateStats(layer.stats());
};

App.prototype._setupLayers = function() {
    var app = this;
    var root = $('#layers');
    root.sortable({
        axis: "y",
        items: ".layer:not(.background)",
        handle: ".handle-icon",
        cursor: "-webkit-grabbing",
        change: function(e, ui) {
            var placeholder = ui.placeholder[0];
            var item = ui.item[0];

            var order = [];
            root.find(root.sortable("option", "items")).each(function(i, layer) {
                if (layer == item) return;
                order.push($(layer == placeholder ? item : layer).attr('data-id'));
            });
            app.style.setLayerOrder(order);
        }
    });
};

App.prototype._setupAddData = function() {
    var app = this;

    // Switch between sidebars.
    $('#add-data').click(function() {
        $('.sidebar').removeClass('visible').filter('#data-sidebar').addClass('visible');
        $('#data-sidebar').find('[value=line]').click();
        $('#data-sidebar').find('#add-data-name').val('');
        $('#data-sidebar').find('.layers input').attr('checked', false);
        $('#data-sidebar').find('.expanded').removeClass('expanded');
    });
    $('#data-sidebar .close-sidebar').click(function() {
        // app.style.highlight(null);
        $('.sidebar').removeClass('visible').filter('#layer-sidebar').addClass('visible');
    });

    // Expand and collapse the layers.
    $('#data-sidebar')
        .on('click', 'input.source-layer', function() {
            $(this).closest('li.source-layer').siblings().removeClass('expanded');
            $(this).closest('li.source-layer').addClass('expanded');
        })

        .on('click', 'input.feature-name', function() {
            $(this).closest('li.feature-name').siblings().removeClass('expanded');
            $(this).closest('li.feature-name').addClass('expanded')
        });


    this.filter = new DataFilterView($('#data-sidebar .layers'));
    $('#add-data-form').submit(function() {
        var data = app.getDataSelection();

        if (data) {
            if (!data.name) {
                alert("You must enter a name");
                return false;
            }
            if (app.style.buckets[data.name]) {
                alert("This name is already taken");
                return false;
            }

            data.bucket = app.style.addBucket(data.name, data.bucket);
            data.layer = app.style.addLayer(data.layer);

            $('#data-sidebar .close-sidebar').click();
            var view = app.createLayerView(data.layer, data.bucket);
            $('#layers').append(view.root);
            view.activate(data.bucket.type == 'point' ? 'symbol' : 'color');
            app.layerViews.push(view);
        }

        return false;
    });

    this.filter.on('selection', function() {
        if (!app.style) return;

        var data = app.getDataSelection();
        if (data) {
            data.layer.pulsating = 1000;
            data.layer.bucket = '__highlight__';
            data.layer.color = [1, 0, 0, 0.75];
            data.layer.width = 2;
            data.layer = new llmr.StyleLayer(data.layer, app.style);
            app.style.highlight(data.layer, data.bucket);
        } else {
            app.style.highlight(null, null);
        }
    });
};

App.prototype.getDataSelection = function() {
    var name = $('#add-data-name').val();
    var bucket = this.filter.selection();
    var type = $('[name=data-geometry-type]:checked').val();

    if (!bucket || !type) return;

    bucket.type = type;
    var layer = { bucket: name };
    switch (bucket.type) {
        case 'fill': layer.color = '#FF0000'; layer.antialias = true; break;
        case 'line': layer.color = '#00FF00'; layer.width = ["stops"]; break;
        case 'point': layer.image = 'triangle'; layer.imageSize = 12; break;
    }

    return { name: name, layer: layer, bucket: bucket };
};


App.prototype.setStyle = function(style) {
    var app = this;
    this.style = style;
    this.backgroundView = null;
    this.layerViews = [];

    // Enable/Disable the interface
    $('body').toggleClass('no-style-selected', !style);

    $('#layers').empty();

    if (style) {
        this.map.switchStyle(style);

        // Background layer
        var background_layer = new llmr.StyleLayer({ color: style.background.hex() }, style);
        background_layer.on('change', function() {
            app.style.setBackgroundColor(background_layer.data.color);
        });


        var background = this.createLayerView(background_layer, { type: 'background' });
        $('#layers').append(background.root);
        this.backgroundView = background;

        // Actual layers
        for (var i = 0; i < style.layers.length; i++) {
            var layer = style.layers[i];
            var bucket = style.buckets[layer.bucket];
            var view = this.createLayerView(layer, bucket);
            $('#layers').append(view.root);
            this.layerViews.push(view);
        }
    }
};

App.prototype.createLayerView = function(layer, bucket) {
    var app = this;
    var view = new LayerView(layer, bucket, this.map.style);
    view.on('activate', function() {
        app.layerViews.forEach(function(otherView) {
            if (otherView !== view) {
                otherView.deactivate();
            }
        });
        if (app.backgroundView !== view) {
            app.backgroundView.deactivate();
        }
    });
    view.on('remove', function() {
        var index = app.layerViews.indexOf(view);
        if (index >= 0) app.layerViews.splice(index, 1);
        view.off();
    });
    return view;
};

App.prototype.updateSprite = function() {
    this.map.style.setSprite(this.style.sprite);
};

App.prototype.updateStats = function(stats) {
    this.filter.update(stats);

    this.layerViews.forEach(function(view) {
        var count = 0;
        var info = stats[view.bucket.layer];

        if (!info) {
            view.setCount(0);
            return;
        }

        if (view.bucket.field) {
            // Count the selected fields
            var field = info[view.bucket.field];
            if (!field) {
                count = 0;
            } else if (Array.isArray(view.bucket.value)) {
                for (var i = 0; i < view.bucket.value.length; i++) {
                    count += field[view.bucket.value[i]] || 0;
                }
            } else {
                count = field[view.bucket.value] || 0;
            }

        } else {
            // Use the entire layer count.
            count = info['(all)'];
        }

        view.setCount(count);
    });
}