# Copyright (C) 2015 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: mouli@meics.org
# Maintained By: miha@reciprocitylabs.com


from ggrc import extensions

def register_notification_listeners():
  listeners = extensions.get_module_contributions("NOTIFICATION_LISTENERS")
  for listener in listeners:
    listener()


