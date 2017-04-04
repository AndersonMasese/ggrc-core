/*!
 Copyright (C) 2017 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */

(function (GGRC) {
  'use strict';

  /**
   * TreeView-specific utils.
   */
  GGRC.Utils.TreeView = (function () {

    var baseWidgets = GGRC.tree_view.attr('base_widgets_by_type');
    var defaultOrderTypes = GGRC.tree_view.attr('defaultOrderTypes');
    var allTypes = Object.keys(baseWidgets.serialize());
    var orderedModelsForSubTier = {};
    var widgetsCounts = new can.Map({});

    var QueryAPI = GGRC.Utils.QueryAPI;
    var CurrentPage = GGRC.Utils.CurrentPage;
    var SnapshotUtils = GGRC.Utils.Snapshots;

    var SUB_TREE_ELEMENTS_LIMIT = 20;
    var SUB_TREE_FIELDS = Object.freeze([
      'child_id',
      'child_type',
      'context',
      'email',
      'id',
      'is_latest_revision',
      'name',
      'revision',
      'revisions',
      'selfLink',
      'slug',
      'status',
      'title',
      'type',
      'viewLink',
      'workflow_state'
    ]);

    allTypes.forEach(function (type) {
      var related = baseWidgets[type].slice(0);

      orderedModelsForSubTier[type] = _.chain(related)
        .map(function (type) {
          return {
            name: type,
            order: defaultOrderTypes[type]
          };
        })
        .sortByAll(['order', 'name'])
        .map('name')
        .value();
    });

    // Define specific rules for Workflow models
    orderedModelsForSubTier.Cycle = ['CycleTaskGroup'];
    orderedModelsForSubTier.CycleTaskGroup = ['CycleTaskGroupObjectTask'];

    /**
     * Get available and selected columns for Model type
     * @param {String} modelType - Model type.
     * @param {Object} displayPrefs - Display preferences.
     * @return {Object} Table columns configuration.
     */
    function getColumnsForModel(modelType, displayPrefs) {
      var Cacheable = can.Model.Cacheable;
      var Model = CMS.Models[modelType];
      var modelDefinition = Model().class.root_object;
      var modelName = Model.model_singular;
      var mandatoryAttrNames =
        Model.tree_view_options.mandatory_attr_names ||
        Cacheable.tree_view_options.mandatory_attr_names;
      var savedAttrList = displayPrefs ?
        displayPrefs.getTreeViewHeaders(modelName) : [];
      var displayAttrNames =
        savedAttrList.length ? savedAttrList :
          (Model.tree_view_options.display_attr_names ||
          Cacheable.tree_view_options.display_attr_names);
      var disableConfiguration =
        !!Model.tree_view_options.disable_columns_configuration;
      var mandatoryColumns;
      var displayColumns;

      var attrs =
        can.makeArray(
          Model.tree_view_options.mapper_attr_list ||
          Model.tree_view_options.attr_list ||
          Cacheable.attr_list
        ).map(function (attr) {
          attr = Object.assign({}, attr);
          if (!attr.attr_sort_field) {
            attr.attr_sort_field = attr.attr_name;
          }
          return attr;
        }).sort(function (a, b) {
          if (a.order && !b.order) {
            return -1;
          } else if (!a.order && b.order) {
            return 1;
          }
          return a.order - b.order;
        });

      var customAttrs = disableConfiguration ?
        [] :
        GGRC.custom_attr_defs
          .filter(function (def) {
            return def.definition_type === modelDefinition &&
              def.attribute_type !== 'Rich Text';
          }).map(function (def) {
            return {
              attr_title: def.title,
              attr_name: def.title,
              attr_sort_field: def.title,
              display_status: false,
              attr_type: 'custom'
            };
          });

      var allAttrs = attrs.concat(customAttrs);

      if (disableConfiguration) {
        return {
          available: allAttrs,
          selected: allAttrs,
          disableConfiguration: true
        };
      }

      displayAttrNames = displayAttrNames.concat(mandatoryAttrNames);

      allAttrs.forEach(function (attr) {
        attr.display_status = displayAttrNames.indexOf(attr.attr_name) !== -1;
        attr.mandatory = mandatoryAttrNames.indexOf(attr.attr_name) !== -1;
      });

      mandatoryColumns = allAttrs.filter(function (attr) {
        return attr.mandatory;
      });

      displayColumns = allAttrs.filter(function (attr) {
        return attr.display_status && !attr.mandatory;
      });

      return {
        available: allAttrs,
        selected: mandatoryColumns.concat(displayColumns),
        disableConfiguration: false
      };
    }

    /**
     * Set selected columns for Model type
     * @param {String} modelType - Model type.
     * @param {Array} columnNames - Array of column names.
     * @param {Object} displayPrefs - Display preferences.
     * @return {Object} Table columns configuration.
     */
    function setColumnsForModel(modelType, columnNames, displayPrefs) {
      var availableColumns =
        getColumnsForModel(modelType, displayPrefs).available;
      var selectedColumns = [];
      var selectedNames = [];

      availableColumns.forEach(function (attr) {
        if (columnNames.indexOf(attr.attr_name) !== -1) {
          attr.display_status = true;
          selectedColumns.push(attr);
          if (!attr.mandatory) {
            selectedNames.push(attr.attr_name);
          }
        } else {
          attr.display_status = false;
        }
      });

      if (displayPrefs) {
        displayPrefs.setTreeViewHeaders(
          CMS.Models[modelType].model_singular,
          selectedNames
        );
        displayPrefs.save();
      }

      return {
        available: availableColumns,
        selected: selectedColumns
      };
    }

    function displayTreeSubpath(el, path, attemptCounter) {
      var rest = path.split('/');
      var type = rest.shift();
      var id = rest.shift();
      var selector = '[data-object-type=\'' + type +
        '\'][data-object-id=' + id + ']';
      var $node;
      var nodeController;
      var controller;

      if (!attemptCounter) {
        attemptCounter = 0;
      }

      rest = rest.join('/');

      if (type || id) {
        $node = el.find(selector);

        // sometimes nodes haven't loaded yet, wait for them
        if (!$node.size() && attemptCounter < 5) {
          setTimeout(function () {
            displayTreeSubpath(el, path, attemptCounter + 1);
          }, 100);
          return undefined;
        }

        if (!rest.length) {
          controller = $node
            .closest('.cms_controllers_tree_view_node')
            .control();

          if (controller) {
            controller.select();
          }
        } else {
          nodeController = $node.control();
          if (nodeController && nodeController.display_path) {
            return nodeController.display_path(rest);
          }
        }
      }
      return can.Deferred().resolve();
    }

    function getModelsForSubTier(model) {
      return orderedModelsForSubTier[model] || [];
    }

    /**
     *
     * @param type
     * @param id
     * @param filter
     */
    function loadItemsForSubTier(type, id, filter) {
      var allModels = getModelsForSubTier(type);
      var loadedModels = [];
      var relevant = {
        type: type,
        id: id,
        operation: 'relevant'
      };
      var showMore = false;

      return _buildSubTreeCountMap(allModels, relevant, filter)
        .then(function (result) {
          var countMap = result.countsMap;
          var reqParams;

          loadedModels = Object.keys(countMap);
          showMore = result.showMore;

          reqParams = loadedModels.map(function (model) {
            return QueryAPI.buildParam(
              model,
              {
                current: 1,
                pageSize: countMap[model],
                filter: filter
              },
              relevant,
              SUB_TREE_FIELDS);
          });

          if (SnapshotUtils.isSnapshotParent(relevant.type) ||
            SnapshotUtils.isInScopeModel(relevant.type)) {
            reqParams = reqParams.map(function (item) {
              if (SnapshotUtils.isSnapshotModel(item.object_name)) {
                item = SnapshotUtils.transformQuery(item);
              }
              return item;
            })
          }

          return QueryAPI.makeRequest({data: reqParams});
        })
        .then(function (response) {
          var directlyRelated = [];
          var notRelated = [];

          loadedModels.forEach(function (modelName, index) {
            var values;

            if (SnapshotUtils.isSnapshotModel(modelName) &&
              response[index].Snapshot) {
              values = response[index].Snapshot.values;
            } else {
              values = response[index][modelName].values;
            }

            values.forEach(function (source) {
              var instance = _createInstance(source, modelName);

              if (_isDirectlyRelated(instance)) {
                directlyRelated.push(instance)
              } else {
                notRelated.push(instance);
              }
            });
          });

          return {
            directlyItems: directlyRelated,
            notDirectlyItems: notRelated,
            showMore: showMore
          }
        });
    }

    /**
     *
     * @param requestedType
     * @param relevantToType
     * @param relevantToId
     * @param operation
     * @returns {*}
     */
    function makeRelevantExpression(requestedType,
                                    relevantToType,
                                    relevantToId,
                                    operation) {
      var isObjectBrowser = /^\/objectBrowser\/?$/
        .test(window.location.pathname);
      var expression;

      if (!isObjectBrowser) {
        expression = {
          type: relevantToType,
          id: relevantToId
        };

        expression.operation = operation ? operation :
          _getTreeViewOperation(requestedType);
      }
      return expression;
    }

    /**
     * Counts for related objects.
     *
     * @return {can.Map} Promise which return total count of objects.
     */
    function getCounts() {
      return widgetsCounts;
    }

    function initCounts(widgets, type, id) {
      var params = can.makeArray(widgets)
        .map(function (widgetType) {
          var param;
          if (SnapshotUtils.isSnapshotRelated(type, widgetType)) {
            param = QueryAPI.buildParam('Snapshot', {},
              makeRelevantExpression(widgetType, type, id), null,
              GGRC.query_parser.parse('child_type = ' + widgetType));
          } else if (typeof widgetType === 'string') {
            param = QueryAPI.buildParam(widgetType, {},
              makeRelevantExpression(widgetType, type, id));
          } else {
            param = QueryAPI.buildParam(widgetType.name, {},
              makeRelevantExpression(widgetType, type, id),
              null, widgetType.additionalFilter);
          }
          param.type = 'count';
          return param;
        });

      return QueryAPI.makeRequest({
        data: params
      }).then(function (data) {
        data.forEach(function (info, i) {
          var widget = widgets[i];
          var name = typeof widget === 'string' ? widget : widget.name;
          var countsName = typeof widget === 'string' ?
            widget : (widget.countsName || widget.name);
          if (SnapshotUtils.isSnapshotRelated(type, name)) {
            name = 'Snapshot';
          }
          widgetsCounts.attr(countsName, info[name].total);
        });
      });
    }

    /**
     *
     * @param models
     * @param relevant
     * @param filter
     * @returns {*}
     * @private
     */
    function _buildSubTreeCountMap (models, relevant, filter) {
      var countQuery = QueryAPI.buildCountParams(models, relevant, filter);

      return QueryAPI.makeRequest({data: countQuery}).then(function (response) {
        var countMap = {};
        var total = 0;
        var showMore = models.some(function (model, index) {
          var count = response[index][model].total;

          if (!count) {
            return;
          }

          if (total + count < SUB_TREE_ELEMENTS_LIMIT) {
            countMap[model] = count;
          } else {
            countMap[model] = SUB_TREE_ELEMENTS_LIMIT - total;
          }

          total += count;

          return total >= SUB_TREE_ELEMENTS_LIMIT;
        });


        return {
          countsMap: countMap,
          showMore: showMore
        };
      });
    }

    /**
     *
     * @param source
     * @param modelName
     * @returns {*}
     * @private
     */
    function _createInstance(source, modelName) {
      var instance;

      if (source.type === 'Snapshot') {
        instance = SnapshotUtils.toObject(source);
      } else {
        instance = CMS.Models[modelName].model(source);
      }
      return instance;
    }

    /**
     *
     * @param instance
     * @private
     */
    function _isDirectlyRelated(instance) {
      var needToSplit = CurrentPage.isObjectContextPage();
      var relates = CurrentPage.related.attr(instance.type);
      var result = true;
      var instanceId = SnapshotUtils.isSnapshot(instance) ?
        instance.snapshot.child_id :
        instance.id;

      if (needToSplit) {
        result = !!(relates && relates[instanceId]);
      }

      return result;
    }

    function _getTreeViewOperation(objectName) {
      var isDashboard = /dashboard/.test(window.location);
      var operation;
      if (isDashboard) {
        operation = 'owned';
      } else if (!isDashboard && objectName === 'Person') {
        operation = 'related_people';
      }
      return operation;
    }

    return {
      getColumnsForModel: getColumnsForModel,
      setColumnsForModel: setColumnsForModel,
      displayTreeSubpath: displayTreeSubpath,
      getModelsForSubTier: getModelsForSubTier,
      loadItemsForSubTier: loadItemsForSubTier,
      makeRelevantExpression: makeRelevantExpression,
      getCounts: getCounts,
      initCounts: initCounts
    };
  })();
})(window.GGRC);
