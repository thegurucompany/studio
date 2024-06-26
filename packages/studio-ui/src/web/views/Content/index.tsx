import { Callout } from '@blueprintjs/core'
import { ContentElement } from 'botpress/sdk'
import { lang, utils } from 'botpress/shared'
import classnames from 'classnames'
import { Categories } from 'common/typings'
import _ from 'lodash'
import React, { Component } from 'react'
import { connect } from 'react-redux'
import { RouteComponentProps } from 'react-router'
import {
  deleteContentItems,
  deleteMedia,
  fetchContentCategories,
  fetchContentItems,
  fetchFlows,
  getQNAContentElementUsage,
  upsertContentItem
} from '~/actions'
import CreateOrEditModal from '~/components/Content/CreateOrEditModal'
import { Container } from '~/components/Shared/Interface'
import { getContentItemUsage } from '~/components/Shared/Utils'
import { isOperationAllowed } from '~/components/Shared/Utils/AccessControl'
import DocumentationProvider from '~/components/Util/DocumentationProvider'
import { RootReducer } from '~/reducers'
import { FlowReducer } from '~/reducers/flows'
import { UserReducer } from '~/reducers/user'
import { CONTENT_TYPES_MEDIA } from '~/util/ContentDeletion'

import List from './List'
import Sidebar from './SideBar'
import style from './style.scss'

class ContentView extends Component<Props, State> {
  private canRead = false
  private canEdit = false

  state = {
    searchQuery: null,
    showModal: false,
    modifyId: null,
    selectedId: 'all',
    contentToEdit: null,
    qnaUsage: {}
  }

  initialized = false

  init() {
    if (this.initialized || !this.props.user || this.props.user.email == null) {
      return
    }
    this.initialized = true
    this.canRead = isOperationAllowed({ operation: 'read', resource: 'bot.content' })
    this.canEdit = isOperationAllowed({ operation: 'write', resource: 'bot.content' })

    if (this.canRead) {
      this.props.fetchContentCategories()
      this.props.fetchFlows()
      this.fetchCategoryItems(this.state.selectedId)
      this.props.getQNAContentElementUsage()
    }
  }

  componentDidMount() {
    this.init()
  }

  componentDidUpdate() {
    this.init()
  }

  fetchCategoryItems(id: string) {
    if (!this.canRead) {
      return Promise.resolve()
    }
    return this.props.fetchContentItems({
      contentType: id,
      ...this.state.searchQuery
    })
  }

  currentContentType() {
    this.props.contentItems.forEach((element: ContentElementUsage) => {
      element.usage = getContentItemUsage(element.id, this.props.flows, this.props.qnaUsage)
    })

    return this.state.modifyId
      ? _.get(_.find(this.props.contentItems, { id: this.state.modifyId }), 'contentType')
      : this.state.selectedId
  }

  handleCloseModal = () => {
    if (this.state.modifyId === null && CONTENT_TYPES_MEDIA.includes(this.currentContentType())) {
      this.props.deleteMedia(this.state.contentToEdit)
    }

    this.setState({
      showModal: false,
      modifyId: null,
      contentToEdit: null
    })
  }

  handleCreateNew = () => {
    this.setState({
      showModal: true,
      modifyId: null,
      contentToEdit: null
    })
  }

  handleUpsert = () => {
    const contentType = this.currentContentType()
    this.props
      .upsertContentItem({ contentType, formData: this.state.contentToEdit, modifyId: this.state.modifyId })
      .then(() => this.props.fetchContentCategories())
      .then(() => this.fetchCategoryItems(this.state.selectedId))
      .then(() => this.setState({ showModal: false }))
  }

  handleClone = (ids) => {
    return Promise.all(
      this.props.contentItems
        .filter(({ id }) => ids.includes(id))
        .map(({ contentType, formData }) => this.props.upsertContentItem({ formData, contentType }))
    ).then(() => this.fetchCategoryItems(this.state.selectedId))
  }

  handleFormEdited = (data) => {
    this.setState({ contentToEdit: data })
  }

  handleCategorySelected = (id: string) => {
    this.fetchCategoryItems(id)
    this.setState({ selectedId: id })
  }

  handleDeleteSelected = (ids) => {
    this.props
      .deleteContentItems(ids)
      .then(() => this.props.fetchContentCategories())
      .then(() => this.fetchCategoryItems(this.state.selectedId))
  }

  handleModalShowForEdit = (id: string) => {
    const contentToEdit = _.find(this.props.contentItems, { id })
    utils.inspect(contentToEdit)
    this.setState({ modifyId: id, showModal: true, contentToEdit: contentToEdit.formData })
  }

  handleRefresh = () => {
    this.fetchCategoryItems(this.state.selectedId ?? 'all')
  }

  handleSearch = (input) => {
    this.setState({ searchQuery: input })
    setImmediate(() => this.fetchCategoryItems(this.state.selectedId))
  }

  render() {
    const { selectedId = 'all', contentToEdit } = this.state
    const categoriesRegistered = this.props.categories.registered ?? []
    const categoriesUnregistered = this.props.categories.unregistered ?? []
    const selectedCategory = _.find(categoriesRegistered, { id: this.currentContentType() })

    const classNames = classnames(style.content, 'bp-content')

    const hasContentTypes = categoriesRegistered.length || categoriesUnregistered.length

    if (!hasContentTypes) {
      return (
        <div className={classNames}>
          <Callout title={lang.tr('studio.content.noContentDefined')} intent="warning">
            {lang.tr('studio.content.pleaseReadDoc', {
              readTheDocs: (
                <a href="https://studio.getchato.ai/" target="_blank" rel="noopener noreferrer">
                  <strong>{lang.tr('studio.content.readTheDocs')}</strong>
                </a>
              )
            })}
          </Callout>
        </div>
      )
    }

    return (
      <Container>
        <Sidebar
          readOnly={!this.canEdit}
          categories={this.props.categories}
          selectedId={selectedId}
          handleAdd={this.handleCreateNew}
          handleCategorySelected={this.handleCategorySelected}
        />
        <List
          readOnly={!this.canEdit || !categoriesRegistered.length}
          count={
            this.state.selectedId === 'all'
              ? _.sumBy(categoriesRegistered, 'count') || 0
              : _.find(categoriesRegistered, { id: this.state.selectedId }).count
          }
          className={style.contentListWrapper}
          contentItems={categoriesRegistered.length ? this.props.contentItems ?? [] : []}
          handleRefresh={this.handleRefresh}
          handleEdit={this.handleModalShowForEdit}
          handleDeleteSelected={this.handleDeleteSelected}
          handleClone={this.handleClone}
          handleSearch={this.handleSearch}
          refreshCategories={this.props.fetchContentCategories}
        />
        {this.canEdit && (
          <CreateOrEditModal
            show={this.state.showModal}
            schema={selectedCategory?.schema.json ?? {}}
            uiSchema={selectedCategory?.schema.ui ?? {}}
            formData={contentToEdit}
            isEditing={this.state.modifyId !== null}
            handleCreateOrUpdate={this.handleUpsert}
            handleEdit={this.handleFormEdited}
            handleClose={this.handleCloseModal}
          />
        )}
        <DocumentationProvider file="main/content" />
      </Container>
    )
  }
}

const mapStateToProps = (state: RootReducer) => ({
  categories: state.content.categories,
  contentItems: state.content.currentItems,
  flows: state.flows,
  user: state.user,
  qnaUsage: state.content.qnaUsage
})

const mapDispatchToProps = {
  deleteContentItems,
  deleteMedia,
  fetchContentCategories,
  fetchContentItems,
  fetchFlows,
  getQNAContentElementUsage,
  upsertContentItem
}

export default connect(mapStateToProps, mapDispatchToProps)(ContentView)

type Props = {
  fetchContentCategories: Function
  fetchContentItems: Function
  fetchFlows: Function
  getQNAContentElementUsage: Function
  upsertContentItem: Function
  deleteContentItems: Function
  deleteMedia: Function
  categories: Categories
  contentItems: ContentElementUsage[]
  flows: FlowReducer
  user: UserReducer
  qnaUsage: ContentElementUsage[]
} & RouteComponentProps

interface State {
  searchQuery: object
  showModal: boolean
  contentToEdit: object
  modifyId: string
  selectedId: string
  qnaUsage: any
}

export type ContentElementUsage = {
  usage: ContentUsage[]
} & ContentElement

export interface ContentUsage {
  type: string
  id?: string
  name: string
  node?: string
  count: number
}
