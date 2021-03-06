import React from 'react'
import ReactQuill, { Quill } from 'react-quill'
import TextField from 'material-ui/TextField'
import IconMenu from 'material-ui/IconMenu'
import MenuItem from 'material-ui/MenuItem'
import Dialog from 'material-ui/Dialog'
import CircularProgress from 'material-ui/CircularProgress'
import FlatButton from 'material-ui/FlatButton'
import IconButton from 'material-ui/IconButton'
import SelectAll from 'material-ui/svg-icons/content/select-all'
import Close from 'material-ui/svg-icons/navigation/close'
import Add from 'material-ui/svg-icons/content/add'
import Remove from 'material-ui/svg-icons/content/remove'
import path from 'path'

const {
  app,
  shell,
  Menu
} = require('electron').remote
const { remote, ipcRenderer } = require('electron')
var magic = require('crypto')

const Embed = Quill.import('blots/embed')
const Module = Quill.import('core/module')
class FormulaBlot extends Embed {
  static create (value) {
    let node = super.create(value)
    if (typeof value === 'string') {
      console.log(value.indexOf('\\\\(') == 0)
      console.log(value.lastIndexOf('\\\\)') == value.length - 3)
      console.log(value.slice(value.indexOf('\\\\(') + 2, value.lastIndexOf('\\\\)')))
      if (value.indexOf('$') == 0 && value.lastIndexOf('$') == value.length - 1 && value.charAt(1) !== '$' && value.charAt(value.lastIndexOf('$') - 1) !== '$') {
        window.katex.render(value.slice(value.indexOf('$') + 1, value.lastIndexOf('$')), node, {
          displayMode: false,
          throwOnError: false,
          errorColor: '#f00'
        })
      } else if (value.indexOf('$$') == 0 && value.lastIndexOf('$$') == value.length - 2) {
        window.katex.render(value.slice(value.indexOf('$$') + 2, value.lastIndexOf('$$')), node, {
          displayMode: true,
          throwOnError: false,
          errorColor: '#f00'
        })
      } else if (value.indexOf('\\\\(') == 0 && value.lastIndexOf('\\\\)') == value.length - 3) {
        window.katex.render(value.slice(value.indexOf('\\\\(') + 3, value.lastIndexOf('\\\\)')), node, {
          displayMode: false,
          throwOnError: false,
          errorColor: '#f00'
        })
      } else if (value.indexOf('\\\\[') == 0 && value.lastIndexOf('\\\\]') == value.length - 3) {
        window.katex.render(value.slice(value.indexOf('\\\\[') + 3, value.lastIndexOf('\\\\]')), node, {
          displayMode: true,
          throwOnError: false,
          errorColor: '#f00'
        })
      }
      node.setAttribute('data-value', value)
    }
    return node
  }

  static value (domNode) {
    return domNode.getAttribute('data-value')
  }
}
FormulaBlot.blotName = 'formula'
FormulaBlot.className = 'ql-formula'
FormulaBlot.tagName = 'SPAN'
Quill.register(FormulaBlot)

export default class Editor extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      filepath: null,
      password: '',
      encrypting: false,
      decrypting: false,
      displayMode: false,
      areYouSureDialogDisplay: false,
      cryptoOpenProjectDialog: false,
      cryptoCreateProjectDialog: false,
      cryptoExistingProjectDialog: false,
      sureToQuitApp: false
    }
    this.onKeyDownGlobal = this.onKeyDownGlobal.bind(this)
    this.quillRef = null
    this.reactQuillRef = null
  }

  componentDidMount () {
    this.attachQuillRefs()
    if (this.props.fileToOpen !== null) {
      let fp = this.props.fileToOpen
      let extension = path.extname(fp)
      if (extension == '.draft') {
        ipcRenderer.send('openFile', ['openSimpleNoEnc', fp])
        ipcRenderer.on('openSimpleNoEnc', (event, data) => {
          this.quillRef.setContents(JSON.parse(data))
          this.setState({
            filepath: fp
          })
        })
      } else if (extension == '.cdraft') {
        this.setState({
          cryptoOpenProjectDialog: true
        })
        this.fp = fp
      } else {
        ipcRenderer.sendSync('notify', 'unsupportedFP')
      }
    }
    ipcRenderer.on('Save Project', (event, arg) => {
      if (arg) {
        if (this.state.filepath !== null) {
          if (path.extname(this.state.filepath) == '.cdraft') {
            this.onCreateEncryptedProjectAfterSetPassword(this.state.filepath)
          } else {
            let cont = JSON.stringify(this.quillRef.getContents())
            console.log(this.quillRef.getContents())
            console.log(cont)
            ipcRenderer.send('createFile', [this.state.filepath, JSON.stringify(this.quillRef.getContents())])
          }
        } else {
          this.onCreateProjectClick()
        }
      }
    })
    ipcRenderer.on('saveSimpleEncryptedFilename', (event, fileName) => {
      if (fileName == null) {
        this.onNotification('FileWasNotSaved')
        return
      }
      this.setState({
        filepath: fileName,
        cryptoCreateProjectDialog: true
      })
    })
    ipcRenderer.on('Close Project', (event, arg) => {
      if (arg) {
        this.onCloseProject()
      }
    })
    ipcRenderer.on('saveSimpleFilename', (event, [fileName, thenClose]) => {
      if (fileName == null) {
        this.onNotification('FileWasNotSaved')
        return
      }
      ipcRenderer.send('createFile', [fileName, JSON.stringify(this.quillRef.getContents())])
      if (thenClose) {
        this.quillRef.setContents({'ops': [{'insert': ''}]})
        this.quillRef.history.clear()
        this.setState({
          filepath: null,
          password: '',
          areYouSureDialogDisplay: false
        })
      } else {
        this.setState({
          filepath: fileName
        })
      }
    })
    ipcRenderer.on('openSimpleFilename', (event, arg) => {
      let fileNames = arg
      if (fileNames == null) {
        this.onNotification('DidNotChooseFile')
        return
      }
      const fp = fileNames[0]
      let extension = path.extname(fp)
      if (extension == '.draft') {
        ipcRenderer.send('openFile', ['openSimpleNoEnc', fp])
        ipcRenderer.on('openSimpleNoEnc', (event, data) => {
          this.quillRef.setContents(JSON.parse(data))
          this.setState({
            filepath: fp
          })
        })
      } else if (extension == '.cdraft') {
        this.setState({
          cryptoOpenProjectDialog: true
        })
        this.fp = fp
      } else {
        alert('Invalid File Type. Choose .draft or .cdraft')
      }
    })
  }

  componentDidUpdate () {
    this.attachQuillRefs()
    if (this.state.displayMode) {
      document.addEventListener('keydown', this.onKeyDownGlobal, false)
    }
  }

  componentWillUnmount () {
    document.removeEventListener('keydown', this.onKeyDownGlobal, false)
  }

  stopPropagation (event) {
    event.preventDefault()
    event.stopPropagation()
  };

  async encrypt (fp, data, thenClose) {
    magic.pbkdf2(this.state.password, this.state.password + '19(1mfPr1v@cYyYyY!!!11', 100000, 32, 'sha512', (err, derivedKey) => {
      if (err) {
        alert(err)
      } else {
        let iv = magic.randomBytes(16)
        let cipher = magic.createCipheriv('aes-256-cbc', new Buffer(derivedKey), iv)
        try {
          let encrypted = cipher.update(data)
          encrypted = Buffer.concat([encrypted, cipher.final()])
          ipcRenderer.send('createFile', [fp, iv.toString('hex') + '-' + encrypted.toString('hex')])
          this.setState({
            encrypting: false
          }, () => {
            if (thenClose) {
              this.quillRef.setContents({'ops': [{'insert': ''}]})
              this.quillRef.history.clear()
              this.setState({
                filepath: null,
                password: '',
                areYouSureDialogDisplay: false
              })
            } else {
              if (!this.state.filepath) {
                this.setState({
                  filepath: fp
                })
              }
            }
          })
        } catch (ex) {
          this.setState({
            encrypting: false,
            cryptoCreateProjectDialog: true
          })
        }
      }
    })
  }

  async decrypt (data, fp) {
    magic.pbkdf2(this.state.password, this.state.password + '19(1mfPr1v@cYyYyY!!!11', 100000, 32, 'sha512', (err, derivedKey) => {
      if (err) {
        alert(err)
      } else {
        let textParts = data.split('-');
        let iv = new Buffer(textParts.shift(), 'hex');
        let encryptedText = new Buffer(textParts.join('-'), 'hex');
        let decipher = magic.createDecipheriv('aes-256-cbc', new Buffer(derivedKey), iv)
        try {
          let decrypted = decipher.update(encryptedText)
          decrypted = Buffer.concat([decrypted, decipher.final()])
          this.quillRef.setContents(JSON.parse(decrypted.toString()))
          this.setState({
            filepath: fp,
            decrypting: false
          })
        } catch (ex) {
          this.setState({
            decrypting: false,
            cryptoOpenProjectDialog: true
          })
        }
      }
    })
  }

  onKeyDownGlobal (e) {
    if (event.keyCode === 27) {
      remote.getCurrentWindow().setFullScreen(false)
      this.setState({
        displayMode: false
      }, () => {
        document.getElementById('editorrr').style.height = '87vh'
        document.getElementById('editorContent').style.height = '87vh'
        document.removeEventListener('keydown', this.onKeyDownGlobal, false)
      })
    }
  }

  onWindowCloseClick () {
    this.setState({
      sureToQuitApp: true
    })
  }

  attachQuillRefs () {
    if (typeof this.reactQuillRef.getEditor !== 'function') return
    this.quillRef = this.reactQuillRef.getEditor()
  }

  onCreateEncryptedProjectClick () {
    ipcRenderer.send('saveSimpleEncrypted')
  }

  onCreateEncryptedProjectAfterSetPassword (fp, thenClose = false) {
    let data = JSON.stringify(this.quillRef.getContents())
    if (!this.state.encrypting) {
      this.setState({
        encrypting: true
      }, () => {
        setTimeout(() => {
          this.encrypt(fp, data, thenClose)
        }, 300)
      })
    } else {
      setTimeout(() => {
        this.encrypt(fp, data, thenClose)
      }, 300)
    }
  }

  onCreateProjectClick (thenClose = false) {
    ipcRenderer.send('saveSimple', thenClose)
  }

  onOpenEncryptedProjectClick () {
    this.setState({
      decrypting: true
    }, () => {
      let fp = this.fp
      ipcRenderer.send('openFile', ['openEncryptedSuccess', fp])
      ipcRenderer.on('openEncryptedSuccess', (event, data) => {
        this.quillRef.history.clear()
        setTimeout(() => {
          this.decrypt(data, fp)
        }, 400)
      })
    })
  }

  onOpenProjectClick () {
    this.quillRef.history.clear()
    ipcRenderer.send('openSimple')
  }

  onCloseProject () {
    this.setState({
      areYouSureDialogDisplay: true
    })
  }

  onNotification (name) {
    ipcRenderer.send('notify', name)
  }

  onPasswordChange (event) {
    this.setState({
      password: event.target.value
    })
  }

  goToScience () {
    ipcRenderer.send('goToFuckinScience', true)
  }

  editorDisplay () {
    this.setState({
      displayMode: true
    }, () => {
      document.getElementById('editorrr').style.height = '100vh'
      document.getElementById('editorContent').style.height = '100vh'
      remote.getCurrentWindow().setFullScreen(true)
    })
  }

  render () {
    let { width, height } = this.props
    document.title = 'Infinitex ~Draft~ ' + this.state.filepath

    let styles = {
      content: {
        textAlign: 'center',
        alignItems: 'center',
        height: height,
        backgroundColor: '#3b3b3b',
        overflow: 'hidden'
      },
      toolbarStyle: {
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottom: 3,
        borderBottomColor: '#000',
        borderColor: '#F1F1F1'
      },
      titleBarButtons: {
        height: 22,
        width: 22,
        marginTop: 0,
        marginRight: 7,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        zIndex: 3
      },
      editor: {
        width: width * 0.99,
        marginLeft: width * 0.005,
        fontSize: 16 * ((width * 0.96) / 836),
        fontFamily: 'TeXnormal'
      }
    }
    if (this.state.displayMode) {
      styles.editor = {
        width: width,
        height: height,
        position: 'fixed',
        top: 0,
        left: 0,
        fontSize: 16 * ((width) / 836),
        fontFamily: 'TeXnormal'
      }
    } else {
      styles.editor = {
        width: width * 0.99,
        marginLeft: width * 0.005,
        fontSize: 16 * ((width * 0.96) / 836),
        fontFamily: 'TeXnormal'
      }
    }

    let CryptoOpenProjectButtons = [
      <FlatButton
        label='Cancel'
        labelStyle={{color: '#000'}}
        keyboardFocused
        onClick={() => {
          this.setState({
            cryptoOpenProjectDialog: false
          })
        }}
      />,
      <FlatButton
        label='OK'
        labelStyle={{color: '#000'}}
        onClick={() => {
          this.setState({
            cryptoOpenProjectDialog: false
          }, () => {
            this.onOpenEncryptedProjectClick()
          })
        }}
      />
    ]

    let CryptoCreateProjectButtons = [
      <FlatButton
        label='Cancel'
        labelStyle={{color: '#000'}}
        keyboardFocused
        onClick={() => {
          this.setState({
            cryptoCreateProjectDialog: false
          })
        }}
      />,
      <FlatButton
        label='OK'
        labelStyle={{color: '#000'}}
        onClick={() => {
          this.setState({
            cryptoCreateProjectDialog: false,
            encrypted: true
          }, () => {
            this.onCreateEncryptedProjectAfterSetPassword(this.state.filepath)
          })
        }}
      />
    ]

    let RUSDialogActions = [
      <FlatButton
        label='Cancel'
        labelStyle={{color: '#000'}}
        keyboardFocused
        onClick={() => {
          this.setState({
            areYouSureDialogDisplay: false
          })
        }}
      />,
      <FlatButton
        label='Save&Quit'
        labelStyle={{color: '#000'}}
        onClick={() => {
          let thenClose = true
          if (this.state.filepath) {
            if (path.extname(this.state.filepath) == '.cdraft') {
              this.onCreateEncryptedProjectAfterSetPassword(this.state.filepath, thenClose)
            } else {
              ipcRenderer.send('createFile', [this.state.filepath, JSON.stringify(this.quillRef.getContents())])
              this.quillRef.setContents({'ops': [{'insert': ''}]})
              this.quillRef.history.clear()
              this.setState({
                filepath: null,
                password: '',
                areYouSureDialogDisplay: false
              })
            }
          } else {
            this.onCreateProjectClick(thenClose)
          }
        }}
      />,
      <FlatButton
        label='Quit'
        labelStyle={{color: '#000'}}
        onClick={() => {
          this.quillRef.setContents({'ops': [{'insert': ''}]})
          this.quillRef.history.clear()
          this.setState({
            filepath: null,
            password: '',
            areYouSureDialogDisplay: false
          })
        }}
      />
    ]

    let RUSQADialogActions = [
      <FlatButton
        label='Cancel'
        labelStyle={{color: '#000'}}
        keyboardFocused
        onClick={() => {
          this.setState({
            sureToQuitApp: false
          })
        }}
      />,
      <FlatButton
        label='Save&Quit'
        labelStyle={{color: '#000'}}
        onClick={() => {
          this.onCreateProjectClick()
          remote.getCurrentWindow().close()
        }}
      />,
      <FlatButton
        label='Quit'
        labelStyle={{color: '#000'}}
        onClick={() => {
          remote.getCurrentWindow().close()
        }}
      />
    ]

    return (
      <div style={styles.content}>
        <Dialog
          modal
          title={'Are you sure?'}
          open={this.state.sureToQuitApp}
          actions={RUSQADialogActions}
          onRequestClose={
            () => {
              this.setState({
                sureToQuitApp: false
              })
            }
          }
          autoScrollBodyContent
          bodyStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          contentStyle={{
            maxWidth: 'none',
            width: '50%',
            maxHeight: 'none',
            height: '50%'
          }}
          actionsContainerStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          titleStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          >
            Choose what you want to do with your current project before quitting the app. Hope to see you again!
        </Dialog>
        <Dialog
          modal
          title={'Are you sure?'}
          open={this.state.areYouSureDialogDisplay}
          actions={RUSDialogActions}
          onRequestClose={
            () => {
              this.setState({
                areYouSureDialogDisplay: false
              })
            }
          }
          autoScrollBodyContent
          bodyStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          contentStyle={{
            maxWidth: 'none',
            width: '50%',
            maxHeight: 'none',
            height: '50%'
          }}
          actionsContainerStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          titleStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          >
            Are you sure you want to quit the project? Before you do, make sure you have
            saved everything or your changes will be lost!
        </Dialog>
        <Dialog
          modal
          title={'Create Encrypted Project'}
          open={this.state.cryptoCreateProjectDialog}
          actions={CryptoCreateProjectButtons}
          onRequestClose={
            () => {
              this.setState({
                cryptoCreateProjectDialog: false
              })
            }
          }
          autoScrollBodyContent
          bodyStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          contentStyle={{
            maxWidth: 'none',
            width: '50%',
            maxHeight: 'none',
            height: '50%'
          }}
          actionsContainerStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          titleStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          >
          <TextField
            id='anteGamhsou1'
            value={this.state.password}
            autoFocus
            type='password'
            onChange={(e) => this.onPasswordChange(e)}
            onBlur={() => document.getElementById('anteGamhsou1').focus()}
            onKeyPress={(e) => {
              if (e.key == 'Enter') {
                this.setState({
                  cryptoCreateProjectDialog: false
                }, () => {
                  this.onCreateEncryptedProjectAfterSetPassword(this.state.filepath)
                })
              }
            }}
            hintStyle={{ width: '90%', color: '#000'}}
            inputStyle={{
              fontSize: '12pt',
              color: '#000'
            }}
            style={{
              width: '90%'
            }}
            />
        </Dialog>
        <Dialog
          modal
          title={'Open Encrypted Project'}
          open={this.state.cryptoOpenProjectDialog}
          actions={CryptoOpenProjectButtons}
          onRequestClose={
            () => {
              this.setState({
                cryptoOpenProjectDialog: false
              })
            }
          }
          autoScrollBodyContent
          bodyStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          contentStyle={{
            maxWidth: 'none',
            width: '50%',
            maxHeight: 'none',
            height: '50%'
          }}
          actionsContainerStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          titleStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000'
          }}
          >
          <TextField
            id='anteGamhsou'
            type='password'
            onChange={(e) => this.onPasswordChange(e)}
            onBlur={() => document.getElementById('anteGamhsou').focus()}
            onKeyPress={(e) => {
              if (e.key == 'Enter') {
                this.setState({
                  cryptoOpenProjectDialog: false
                }, () => {
                  this.onOpenEncryptedProjectClick()
                })
              }
            }}
            hintStyle={{ width: '90%', color: '#000'}}
            inputStyle={{
              fontSize: '12pt',
              color: '#000'
            }}
            style={{
              width: '90%'
            }}
            />
        </Dialog>
        <Dialog
          modal
          title={'Decrypting...'}
          open={this.state.decrypting}
          autoScrollBodyContent
          bodyStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000',
            textAlign: 'center'
          }}
          contentStyle={{
            maxWidth: 'none',
            width: '80%',
            maxHeight: 'none',
            height: '80%',
            textAlign: 'center'
          }}
          titleStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000',
            textAlign: 'center'
          }}
          >
          <CircularProgress
            size={100}
            thickness={10}
            color={'#000'}
            style={{margin: 50}}
            />
        </Dialog>
        <Dialog
          modal
          title={'Encrypting...'}
          open={this.state.encrypting}
          autoScrollBodyContent
          bodyStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000',
            textAlign: 'center'
          }}
          contentStyle={{
            maxWidth: 'none',
            width: '80%',
            maxHeight: 'none',
            height: '80%',
            textAlign: 'center'
          }}
          titleStyle={{
            backgroundColor: '#F1F1F1',
            color: '#000',
            textAlign: 'center'
          }}
          >
          <CircularProgress
            size={100}
            thickness={10}
            color={'#000'}
            style={{margin: 50}}
            />
        </Dialog>
        <div
          onClick={(event) => this.stopPropagation(event)}
          style={{backgroundColor: '#fff'}}
        >
          <IconMenu
            className='iconMenuSimple'
            iconButtonElement={
              <img
                src='../src/static/infty_black.svg'
                style={{height: '7vh', cursor: 'pointer', TextAlign: 'center'}}
              />
            }
            anchorOrigin={{horizontal: 'left', vertical: 'top'}}
            targetOrigin={{horizontal: 'left', vertical: 'top'}}
            value={0}
          >
            <MenuItem value={1} primaryText='Open Document' style={{color: '#fff'}} onClick={() => this.onOpenProjectClick()} />
            <MenuItem value={2} primaryText='Create Document' style={{color: '#fff'}} onClick={() => this.onCreateProjectClick()} />
            <MenuItem value={3} primaryText='Create Encrypted Document' style={{color: '#fff'}} onClick={() => this.onCreateEncryptedProjectClick()} />
            <MenuItem value={4} primaryText='FullScreen' leftIcon={<SelectAll />} style={{color: '#fff'}} onClick={() => this.editorDisplay()} />
            <MenuItem value={5} primaryText='Switch to science' style={{color: '#fff'}} onClick={() => this.goToScience()} />
            <MenuItem value={6} primaryText='Quit Project' style={{color: '#fff'}} onClick={() => this.onCloseProject()} />
          </IconMenu>
        </div>
        <ReactQuill
          id='editorrr'
          ref={(el) => { this.reactQuillRef = el }}
          placeholder={'Don\'t just look at me...'}
          modules={{
            formula: true,
            syntax: true,
            history: {
              delay: 200,
              userOnly: true
            },
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              [{ 'font': [] }],
              ['bold', 'italic', 'underline', 'strike'],
              ['blockquote', 'code-block'],
              [{ 'color': [] }, { 'background': [] }],
              [{ 'script': 'sub'}, { 'script': 'super' }],
              [{ 'align': ['right', 'center', 'justify'] }],
              [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
              ['image'],
              ['formula'],
              ['clean']
            ]
          }}
          formats={
          [
            'header',
            'font',
            'bold', 'italic', 'underline', 'strike',
            'blockquote', 'code-block',
            'color', 'background',
            'script', 'sub', 'super',
            'align', 'right', 'center', 'justify',
            'list', 'bullet', 'indent',
            'image',
            'formula'
          ]
          }
          theme={'snow'}
          style={{
            height: '87vh',
            marginBottom: 0
          }}
        >
          <div id='editorContent' style={styles.editor} />
        </ReactQuill>
      </div>
    )
  }
}
