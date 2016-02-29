# Copyright (C) 2015 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: jernej@reciprocitylabs.com
# Maintained By: jernej@reciprocitylabs.com

"""All smoke tests relevant to my work page"""
# pylint: disable=no-self-use
# pylint: disable=invalid-name
# pylint: disable=too-few-public-methods
# pylint: disable=unused-argument

import pytest    # pylint: disable=import-error

from lib import base
from lib import exception
from lib.page import dashboard
from lib.page import lhn
from lib.constants.test import batch
from lib.page.widget import controls
from lib import conftest_utils
from lib import selenium_utils


class TestMyWorkPage(base.Test):
  """Tests the my work page, a part of smoke tests, section 2"""

  @pytest.mark.smoke_tests
  def test_horizontal_nav_bar_tabs(self, selenium, battery_of_controls):
    """Tests that several objects in a widget can be deleted sequentially"""
    controls_widget = dashboard\
        .DashboardPage(selenium.driver)\
        .select_controls()

    try:
      for _ in xrange(batch.BATTERY):
        controls_widget\
            .select_nth_member(0)\
            .press_object_settings()\
            .select_edit()\
            .delete_object()\
            .confirm_delete()
    except exception.RedirectTimeout:
      # we expect this exception since the url will stay the same for the last
      # deleted member in object list in a widget
      assert controls.Controls(selenium.driver).members_listed == []
    else:
      assert False

  @pytest.mark.smoke_tests
  def test_redirect(self, selenium):
    """Tests if the user is redirected to the My Work page after clicking on
    the my work button in user dropdown"""
    conftest_utils.navigate_to_page_that_contains_lhn(selenium.driver)

    dashboard.HeaderPage(selenium.driver)\
        .open_user_list()\
        .select_my_work()

    assert selenium.driver.current_url == dashboard.DashboardPage.URL

  @pytest.mark.smoke_tests
  def test_lhn_stays_expanded(self, selenium):
    """Tests if, after opening the LHN, it slides out and stays expanded."""
    conftest_utils.navigate_to_page_that_contains_lhn(selenium.driver)

    lhn_menu = dashboard.HeaderPage(selenium.driver).open_lhn_menu()
    initial_position = lhn_menu.my_objects.element.location

    selenium_utils.wait_until_stops_moving(lhn_menu.my_objects.element)
    selenium_utils.hover_over_element(
        selenium.driver,
        dashboard.HeaderPage(selenium.driver).button_my_tasks.element)

    assert initial_position == \
        lhn.Menu(selenium.driver).my_objects.element.location

  @pytest.mark.smoke_tests
  def test_lhn_remembers_tab_state(self, selenium):
    """Tests if LHN remembers which tab is selected (my or all objects) after
    closing it"""
    conftest_utils.navigate_to_page_that_contains_lhn(selenium.driver)
    header = dashboard.HeaderPage(selenium.driver)

    # check if my objects tab saves state
    lhn_menu = header.open_lhn_menu()
    lhn_menu.select_my_objects()
    header.close_lhn_menu()
    header.open_user_list()
    new_lhn = header.open_lhn_menu()
    assert selenium_utils.check_if_element_active(
        new_lhn.my_objects.element) is True

    # check if all objects tab saves state
    lhn_menu = header.open_lhn_menu()
    lhn_menu.select_all_objects()
    header.close_lhn_menu()
    header.open_user_list()
    new_lhn = header.open_lhn_menu()
    assert selenium_utils.check_if_element_active(
        new_lhn.all_objects.element) is True

  @pytest.mark.smoke_tests
  def test_lhn_pin(self, selenium):
    """Tests if the pin is present and if it's default state is off"""
    conftest_utils.navigate_to_page_that_contains_lhn(selenium.driver)
    lhn_menu = dashboard.HeaderPage(selenium.driver).open_lhn_menu()
    assert lhn_menu.pin.is_activated is False
