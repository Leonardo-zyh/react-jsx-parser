import { Parser } from 'acorn-jsx'
import React, { Component, Fragment } from 'react'
import parseStyle from '../helpers/parseStyle'
import { randomHash } from '../helpers/hash'

import ATTRIBUTES from '../constants/attributeNames'
import { canHaveChildren, canHaveWhitespace } from '../constants/specialTags'

const parserOptions = { plugins: { jsx: true } }

export default class JsxParser extends Component {
  static defaultProps = {
    bindings:         {},
    blacklistedAttrs: [/^on.+/i],
    blacklistedTags:  ['script'],
    components:       [],
    componentsOnly:   false,
    jsx:              '',
    onError:          () => { },
    showWarnings:     false,
    renderInWrapper:  true,
  }

  static displayName = 'JsxParser'

  parseJSX = (rawJSX) => {
    const wrappedJsx = `<root>${rawJSX}</root>`
    let parsed = []
    try {
      parsed = (new Parser(parserOptions, wrappedJsx)).parse()
      parsed = parsed.body[0].expression.children || []
    } catch (error) {
      // eslint-disable-next-line no-console
      if (this.props.showWarnings) console.warn(error)
      if (this.props.onError) this.props.onError(error)
      return []
    }

    return parsed.map(this.parseExpression).filter(Boolean)
  }

  parseExpression = (expression) => {
    /* eslint-disable no-case-declarations */
    switch (expression.type) {
      case 'JSXElement':
        return this.parseElement(expression)
      case 'JSXText':
        return <Fragment key={randomHash()}>{expression.value || ''}</Fragment>
      case 'JSXAttribute':
        if (expression.value === null) return true
        return this.parseExpression(expression.value)

      case 'ArrayExpression':
        return expression.elements.map(this.parseExpression)
      case 'ObjectExpression':
        const object = {}
        expression.properties.forEach((prop) => {
          object[prop.key.name || prop.key.value] = this.parseExpression(prop.value)
        })
        return object
      case 'Identifier':
        return (this.props.bindings || {})[expression.name]
      case 'JSXExpressionContainer':
        return this.parseExpression(expression.expression)
      case 'Literal':
        return expression.value
      case 'MemberExpression':
        return (this.parseExpression(expression.object) || {})[expression.property.name]
      case 'CallExpression':
        return this.parseExpression(expression.callee);
      case 'LogicalExpression':
        const left = this.parseExpression(expression.left);

        if (expression.operator === '||' && left) return true;

        if ((expression.operator === '&&' && left) || (expression.operator === '||' && !left)) {
          return this.parseExpression(expression.right);
        }

        return false;
      default:
        return undefined
    }
  }

  parseElement = (element) => {
    const { components = {}, componentsOnly } = this.props
    const { children: childNodes = [], openingElement } = element
    const { attributes = [], name: { name } = {} } = openingElement

    const blacklistedAttrs = (this.props.blacklistedAttrs || [])
      .map(attr => (attr instanceof RegExp ? attr : new RegExp(attr, 'i')))
    const blacklistedTags = (this.props.blacklistedTags || [])
      .map(tag => tag.trim().toLowerCase()).filter(Boolean)


    if (/^(html|head|body)$/i.test(name)) return childNodes.map(c => this.parseElement(c))

    if (blacklistedTags.indexOf(name.trim().toLowerCase()) !== -1) return undefined
    if (componentsOnly && !components[name]) return undefined

    let children
    if (components[name] || canHaveChildren(name)) {
      children = childNodes.map(this.parseExpression)
      if (!components[name] && !canHaveWhitespace(name)) {
        children = children.filter(child => (
          typeof child !== 'string' || !/^\s*$/.test(child)
        ))
      }

      if (children.length === 0) {
        children = undefined
      } else if (children.length === 1) {
        [children] = children
      }
    }

    const props = { key: randomHash() }
    attributes.forEach((expr) => {
      const rawName = expr.name.name
      const attributeName = ATTRIBUTES[rawName] || rawName
      // if the value is null, this is an implicitly "true" prop, such as readOnly
      const value = this.parseExpression(expr)

      const matches = blacklistedAttrs.filter(re => re.test(attributeName))
      if (matches.length === 0) props[attributeName] = value
    })

    if (typeof props.style === 'string') {
      props.style = parseStyle(props.style)
    }

    if (children) props.children = children

    return React.createElement(components[name] || name.toLowerCase(), props)
  }

  render = () => {
    const jsx = (this.props.jsx || '').trim().replace(/<!DOCTYPE([^>]*)>/g, '')
    this.ParsedChildren = this.parseJSX(jsx)

    return (
      this.props.renderInWrapper
        ? <div className="jsx-parser">{this.ParsedChildren}</div>
        : <Fragment>{this.ParsedChildren}</Fragment>
    )
  }
}

if (process.env.NODE_ENV !== 'production') {
  /* eslint-disable react/no-unused-prop-types */
  // eslint-disable-next-line global-require,import/no-extraneous-dependencies
  const PropTypes = require('prop-types')
  JsxParser.propTypes = {
    bindings:         PropTypes.shape({}),
    blacklistedAttrs: PropTypes.arrayOf(PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(RegExp),
    ])),
    blacklistedTags: PropTypes.arrayOf(PropTypes.string),
    components:      PropTypes.shape({}),
    componentsOnly:  PropTypes.bool,
    jsx:             PropTypes.string,
    onError:         PropTypes.func,
    showWarnings:    PropTypes.bool,
    renderInWrapper: PropTypes.bool,
  }
}
