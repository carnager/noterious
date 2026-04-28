{ lib
, buildGoModule
, version ? "unstable"
, src ? lib.cleanSource ../.
}:

buildGoModule {
  pname = "noterious";
  inherit version src;

  subPackages = [ "cmd/noterious" ];
  vendorHash = "sha256-Y/RrZE4SN0H8sknNp1rBDIRRNmw929tkPsZDcMeYUs4=";

  postInstall = ''
    install -Dm644 contrib/systemd/noterious.service $out/lib/systemd/user/noterious.service
  '';

  meta = with lib; {
    description = "Server-first, markdown-backed personal knowledge base";
    homepage = "https://github.com/carnager/noterious";
    license = licenses.isc;
    mainProgram = "noterious";
    platforms = platforms.linux;
  };
}
