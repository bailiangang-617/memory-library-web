Component({
  properties: {
    photos: {
      type: Array,
      value: []
    },
    selectMode: {
      type: Boolean,
      value: false
    },
    selectedIds: {
      type: Array,
      value: []
    }
  },
  data: {
    items: []
  },
  observers: {
    'photos, selectedIds': function (photos, selectedIds) {
      const selected = selectedIds || []
      this.setData({
        items: (photos || []).map((photo) => ({
          ...photo,
          checked: selected.indexOf(photo.id) > -1
        }))
      })
    }
  },
  methods: {
    onTap(event) {
      const { id } = event.currentTarget.dataset
      this.triggerEvent('select', { id })
    }
  }
})
