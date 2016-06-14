'use strict';

const React = require('react');

/**
 * The actions class.
 */
const ACTIONS = 'actions';

/**
 * General element action component.
 */
class RemoveAction extends React.Component {

  /**
   * The component constructor.
   *
   * @param {Object} props - The properties.
   */
  constructor(props) {
    super(props);
    this.element = props.element;
  }

  /**
   * Render a single editable key.
   *
   * @returns {React.Component} The element component.
   */
  render() {
    return (
      <div className={ACTIONS} onClick={this.handleClick.bind(this)}>X</div>
    );
  }

  /**
   * Remove the change.
   */
  handleClick() {
    this.element.remove();
  }
}

RemoveAction.displayName = 'RemoveAction';

module.exports = RemoveAction;
