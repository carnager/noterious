{
  description = "Noterious personal knowledge base";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
      version =
        let
          lastModifiedDate = if self ? lastModifiedDate then self.lastModifiedDate else "19700101";
          shortRev = if self ? shortRev then self.shortRev else "dirty";
        in
        "unstable-${lastModifiedDate}-${shortRev}";
    in
    {
      packages = forAllSystems (pkgs:
        let
          noterious = pkgs.callPackage ./nix/package.nix {
            inherit version;
            src = self;
          };
        in
        {
          inherit noterious;
          default = noterious;
        }
      );

      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.system}.default}/bin/noterious";
        };
      });

      nixosModules = {
        noterious = import ./nix/module.nix;
        default = self.nixosModules.noterious;
      };

      checks = lib.genAttrs systems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          evaluated = nixpkgs.lib.nixosSystem {
            inherit system;
            modules = [
              self.nixosModules.default
              ({ ... }: {
                services.noterious.instances.main = {
                  enable = true;
                  port = 3200;
                  dataDir = "/var/lib/noterious/main";
                  vaultDir = "/var/lib/noterious/main/vault";
                };
              })
            ];
          };
        in
        {
          package = self.packages.${system}.default;
          module = pkgs.writeText "noterious-module-check.json" (builtins.toJSON {
            execStart = evaluated.config.systemd.services."noterious@main".serviceConfig.ExecStart;
            wantedBy = evaluated.config.systemd.services."noterious@main".wantedBy;
          });
        }
      );
    };
}
