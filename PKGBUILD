pkgname=noterious
pkgver=0.1.12
pkgrel=1
pkgdesc="Server-first markdown notebook with queries, tasks, history, notifications, and a web UI"
arch=('x86_64' 'aarch64')
url="https://github.com/carnager/noterious"
license=('custom')
depends=()
makedepends=('go')
source=("$pkgname-$pkgver.tar.gz::$url/archive/refs/tags/$pkgver.tar.gz")
sha256sums=('SKIP')

build() {
  cd "$srcdir/$pkgname-$pkgver"
  test -f internal/httpapi/static/app.js
  test -f internal/httpapi/static/editor.bundle.js
  go build -trimpath -o "$pkgname" ./cmd/noterious
}

package() {
  cd "$srcdir/$pkgname-$pkgver"
  install -Dm755 "$pkgname" "$pkgdir/usr/bin/$pkgname"
  install -Dm644 contrib/systemd/noterious.service "$pkgdir/usr/lib/systemd/user/noterious.service"
  install -Dm644 README.md "$pkgdir/usr/share/doc/$pkgname/README.md"
  install -Dm644 CHANGELOG.md "$pkgdir/usr/share/doc/$pkgname/CHANGELOG.md"
}
