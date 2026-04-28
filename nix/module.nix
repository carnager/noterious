{ config, lib, pkgs, utils, ... }:

let
  cfg = config.services.noterious;
  defaultPackage = pkgs.callPackage ./package.nix {};
  enabledInstances = lib.filterAttrs (_: instance: instance.enable) cfg.instances;
  anyEnabled = enabledInstances != {};

  bindAddressFor = instance:
    if lib.hasInfix ":" instance.listenAddress && !lib.hasPrefix "[" instance.listenAddress
    then "[${instance.listenAddress}]:${toString instance.port}"
    else "${instance.listenAddress}:${toString instance.port}";

  duplicateValues = values:
    lib.unique (
      lib.filter (value: lib.length (lib.filter (candidate: candidate == value) values) > 1) values
    );

  duplicateBindAddresses =
    duplicateValues (lib.mapAttrsToList (_: instance: bindAddressFor instance) enabledInstances);
  duplicateDataDirs =
    duplicateValues (lib.mapAttrsToList (_: instance: instance.dataDir) enabledInstances);

  tmpfilesRules = lib.concatLists (lib.mapAttrsToList (_: instance:
    [
      "d ${instance.dataDir} 0750 ${cfg.user} ${cfg.group} - -"
    ] ++ lib.optional instance.createVaultDir
      "d ${instance.vaultDir} 0750 ${cfg.user} ${cfg.group} - -"
  ) enabledInstances);
in
{
  options.services.noterious = {
    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "pkgs.callPackage ./nix/package.nix {}";
      description = "The Noterious package to run for every configured instance.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "noterious";
      description = ''
        System user used by all Noterious instances.
        The module auto-creates this user when left at the default value.
      '';
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "noterious";
      description = ''
        System group used by all Noterious instances.
        The module auto-creates this group when left at the default value.
      '';
    };

    instances = lib.mkOption {
      default = {};
      description = "Configured Noterious instances.";
      example = lib.literalExpression ''
        {
          main = {
            enable = true;
            port = 3000;
            vaultDir = "/srv/noterious/main/vault";
          };

          work = {
            enable = true;
            port = 3001;
            vaultDir = "/srv/noterious/work/vault";
            openFirewall = true;
          };
        }
      '';
      type = lib.types.attrsOf (lib.types.submodule ({ name, ... }: {
        options = {
          enable = lib.mkEnableOption "the ${name} Noterious instance";

          listenAddress = lib.mkOption {
            type = lib.types.str;
            default = "127.0.0.1";
            example = "0.0.0.0";
            description = "Address the instance should bind to.";
          };

          port = lib.mkOption {
            type = lib.types.port;
            default = 3000;
            description = "TCP port used by the instance.";
          };

          dataDir = lib.mkOption {
            type = lib.types.str;
            default = "/var/lib/noterious/${name}";
            description = "Writable data directory for the instance.";
          };

          vaultDir = lib.mkOption {
            type = lib.types.str;
            default = "/var/lib/noterious/${name}/vault";
            description = "Vault root served by the instance.";
          };

          createVaultDir = lib.mkOption {
            type = lib.types.bool;
            default = true;
            description = "Whether to create the configured vault directory via tmpfiles.";
          };

          openFirewall = lib.mkOption {
            type = lib.types.bool;
            default = false;
            description = "Whether to open the configured port in the NixOS firewall.";
          };

          watchInterval = lib.mkOption {
            type = lib.types.str;
            default = "2s";
            description = "Value for `NOTERIOUS_WATCH_INTERVAL`.";
          };

          ntfyInterval = lib.mkOption {
            type = lib.types.str;
            default = "1m";
            description = "Value for `NOTERIOUS_NTFY_INTERVAL`.";
          };

          authCookieName = lib.mkOption {
            type = lib.types.str;
            default = "noterious_session";
            description = "Cookie name used by the embedded auth service.";
          };

          authSessionTTL = lib.mkOption {
            type = lib.types.str;
            default = "720h";
            description = "Value for `NOTERIOUS_AUTH_SESSION_TTL`.";
          };

          bootstrapUsername = lib.mkOption {
            type = lib.types.str;
            default = "";
            description = ''
              Optional bootstrap username used for unattended initial provisioning.
              Only used when a bootstrap password is also configured.
            '';
          };

          bootstrapPasswordFile = lib.mkOption {
            type = lib.types.nullOr lib.types.path;
            default = null;
            description = ''
              Optional file containing the bootstrap password.
              The module exposes it through `NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD_FILE`.
            '';
          };

          environment = lib.mkOption {
            type = lib.types.attrsOf lib.types.str;
            default = {};
            description = "Additional environment variables for the instance service.";
          };

          extraArgs = lib.mkOption {
            type = lib.types.listOf lib.types.str;
            default = [];
            example = lib.literalExpression ''[ "--listen-addr" "127.0.0.1:4300" ]'';
            description = "Additional CLI flags appended to the generated `ExecStart` command.";
          };

          extraServiceConfig = lib.mkOption {
            type = lib.types.attrsOf lib.types.anything;
            default = {};
            description = "Extra `serviceConfig` values merged into the generated systemd service.";
          };
        };
      }));
    };
  };

  config = lib.mkIf anyEnabled (lib.mkMerge [
    {
      assertions =
        [
          {
            assertion = duplicateBindAddresses == [];
            message = "services.noterious instances must not share the same listen address and port: ${lib.concatStringsSep ", " duplicateBindAddresses}";
          }
          {
            assertion = duplicateDataDirs == [];
            message = "services.noterious instances must not share the same dataDir: ${lib.concatStringsSep ", " duplicateDataDirs}";
          }
        ]
        ++ lib.concatLists (lib.mapAttrsToList (name: instance: [
          {
            assertion = lib.hasPrefix "/" instance.dataDir;
            message = "services.noterious.instances.${name}.dataDir must be an absolute path";
          }
          {
            assertion = lib.hasPrefix "/" instance.vaultDir;
            message = "services.noterious.instances.${name}.vaultDir must be an absolute path";
          }
        ]) enabledInstances);

      networking.firewall.allowedTCPPorts =
        lib.unique (lib.mapAttrsToList (_: instance: instance.port)
          (lib.filterAttrs (_: instance: instance.openFirewall) enabledInstances));

      systemd.tmpfiles.rules = tmpfilesRules;

      systemd.services = lib.mapAttrs' (name: instance:
        lib.nameValuePair "noterious@${name}" {
          description = "Noterious instance ${name}";
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          wantedBy = [ "multi-user.target" ];
          unitConfig.RequiresMountsFor = [ instance.dataDir instance.vaultDir ];
          environment = instance.environment
            // {
              NOTERIOUS_WATCH_INTERVAL = instance.watchInterval;
              NOTERIOUS_NTFY_INTERVAL = instance.ntfyInterval;
              NOTERIOUS_AUTH_COOKIE_NAME = instance.authCookieName;
              NOTERIOUS_AUTH_SESSION_TTL = instance.authSessionTTL;
              NOTERIOUS_AUTH_BOOTSTRAP_USERNAME = instance.bootstrapUsername;
            }
            // lib.optionalAttrs (instance.bootstrapPasswordFile != null) {
              NOTERIOUS_AUTH_BOOTSTRAP_PASSWORD_FILE = toString instance.bootstrapPasswordFile;
            };
          serviceConfig = {
            Type = "simple";
            User = cfg.user;
            Group = cfg.group;
            WorkingDirectory = instance.dataDir;
            ExecStart = "${lib.getExe cfg.package} ${utils.escapeSystemdExecArgs (
              [
                "--listen-addr"
                (bindAddressFor instance)
                "--data-dir"
                instance.dataDir
                "--vault-dir"
                instance.vaultDir
              ]
              ++ instance.extraArgs
            )}";
            Restart = "on-failure";
            RestartSec = "2s";
            UMask = "0077";
            PrivateTmp = true;
            NoNewPrivileges = true;
            ProtectSystem = "strict";
            ReadWritePaths = lib.unique [ instance.dataDir instance.vaultDir ];
          } // instance.extraServiceConfig;
        }
      ) enabledInstances;
    }

    (lib.mkIf (cfg.group == "noterious") {
      users.groups.noterious = {};
    })

    (lib.mkIf (cfg.user == "noterious") {
      users.users.noterious = {
        isSystemUser = true;
        description = "Noterious service user";
        group = cfg.group;
        home = "/var/lib/noterious";
        createHome = false;
      };
    })
  ]);
}
