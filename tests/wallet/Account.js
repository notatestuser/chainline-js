import Account from '../../src/wallet/Account'

describe('Account', function () {
  const acct = {
    WIF: 'L2QTooFoDFyRFTxmtiVHt5CfsXfVnexdbENGDkkrrgTTryiLsPMG',
    privateKey: '9ab7e154840daca3a2efadaf0df93cd3a5b51768c632f5433f86909d9b994a69',
    publicKey: '031d8e1630ce640966967bc6d95223d21f44304133003140c3b52004dc981349c9',
    scriptHash: '5df31f6f59e6a4fbdd75103786bf73db1000b235',
    address: 'ALfnhLg7rUyL6Jr98bzzoxz5J7m64fbR4s'
  }
  it('can be created with different formats', () => {
    Object.keys(acct).map((key) => {
      // Skip scriptHash as it cannot be used.
      if (key === 'scriptHash') return
      const a = new Account(acct[key])
      a.should.not.equal(undefined)
      a[key].should.equal(acct[key])
    })
  })

  it('can query different key formats', () => {
    const a = new Account(acct.WIF)
    a.should.not.equal(undefined)
    a.privateKey.should.equal(acct.privateKey)
    a.publicKey.should.equal(acct.publicKey)
    a.scriptHash.should.equal(acct.scriptHash)
    a.address.should.equal(acct.address)
  })

  it('throws error when insufficient information given', () => {
    const a = new Account(acct.address)
    const thrower = () => a.privateKey
    thrower.should.throw()
  })
})