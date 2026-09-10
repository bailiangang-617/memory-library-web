Component({
  properties: {
    title: String,
    desc: String,
    action: String
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
